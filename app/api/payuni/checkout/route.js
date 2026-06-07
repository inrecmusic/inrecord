import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { PLAN_CATALOG, applyCoupon, couponError } from "@/lib/plans";
import { verifyCarrier, verifyTaxId } from "@/lib/amego-verify";

// 發票欄位驗證（與前端 BuyModal 規則一致）
const MOBILE_BARCODE_RE  = /^\/[0-9A-Z.+-]{7}$/;
const TAX_ID_RE          = /^\d{8}$/;
const MOBILE_CARRIER_TYPE = "3J0002";

function isValidTaxId(id) {
  if (!TAX_ID_RE.test(id) || id === "00000000") return false;
  const weights = [1, 2, 1, 2, 1, 2, 4, 1];
  const digits = id.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    const product = digits[i] * weights[i];
    sum += Math.floor(product / 10) + (product % 10);
  }
  if (sum % 5 === 0) return true;
  return digits[6] === 7 && (sum + 1) % 5 === 0;
}

// Payuni 統一金流 AES-256-GCM 加密
// 輸出格式：hex( base64(密文) + ':::' + base64(GCM tag) )，與官方 SDK 一致
function aesEncrypt(plaintext, key, iv) {
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    Buffer.from(key, "utf8"),
    Buffer.from(iv, "utf8")
  );
  let enc = cipher.update(plaintext, "utf8", "base64");
  enc += cipher.final("base64");
  const tag = cipher.getAuthTag().toString("base64");
  return Buffer.from(`${enc}:::${tag}`, "utf8").toString("hex");
}

// Payuni SHA256 驗證碼：SHA256(HashKey + EncryptInfo + HashIV) 轉大寫
function makeHashInfo(encryptInfo, key, iv) {
  return crypto
    .createHash("sha256")
    .update(key + encryptInfo + iv)
    .digest("hex")
    .toUpperCase();
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { plan, email } = body;

    // 1) 方案合法性 + 價格/品名一律由後端決定
    const catalog = PLAN_CATALOG[plan];
    if (!catalog) return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
    if (!email || typeof email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    }
    let price = catalog.price;
    const label = catalog.label;

    // 2.5) 優惠券：後端重新驗證並計算折後價（不信任前端傳入的折扣）
    let couponCode = null;
    if (body.couponCode) {
      const sb = getSupabaseAdmin();
      if (sb) {
        const { data: coupon } = await sb
          .from("coupons")
          .select("*")
          .eq("code", String(body.couponCode).trim().toUpperCase())
          .maybeSingle();
        const cErr = couponError(coupon);
        if (cErr) return NextResponse.json({ error: cErr }, { status: 400 });
        price = applyCoupon(price, coupon);
        couponCode = coupon.code;
      }
    }
    if (price < 1) return NextResponse.json({ error: "amount_too_low" }, { status: 400 });

    // 2) 發票欄位後端驗證（不信任前端）
    let buyerTaxId  = null;
    let buyerName   = null;
    let carrierType = null;
    let carrierId   = null;

    if (body.buyerTaxId) {
      const id = String(body.buyerTaxId).trim();
      if (!isValidTaxId(id)) return NextResponse.json({ error: "invalid_tax_id" }, { status: 400 });
      if (!body.buyerName || !String(body.buyerName).trim()) {
        return NextResponse.json({ error: "missing_company_name" }, { status: 400 });
      }
      const taxCheck = await verifyTaxId(id);
      if (taxCheck.valid === false) {
        return NextResponse.json({ error: "tax_id_not_exist" }, { status: 400 });
      }
      buyerTaxId = id;
      buyerName  = String(body.buyerName).trim().slice(0, 60);
    } else if (body.carrierType) {
      if (body.carrierType !== MOBILE_CARRIER_TYPE) {
        return NextResponse.json({ error: "invalid_carrier_type" }, { status: 400 });
      }
      const cid = String(body.carrierId || "").trim().toUpperCase();
      if (!MOBILE_BARCODE_RE.test(cid)) return NextResponse.json({ error: "invalid_carrier_id" }, { status: 400 });
      const carrierCheck = await verifyCarrier(cid);
      if (carrierCheck.valid === false) {
        return NextResponse.json({ error: "carrier_not_exist" }, { status: 400 });
      }
      carrierType = MOBILE_CARRIER_TYPE;
      carrierId   = cid;
    }

    const merID   = process.env.PAYUNI_MERCHANT_ID;
    const hashKey = process.env.PAYUNI_HASH_KEY;
    const hashIV  = process.env.PAYUNI_HASH_IV;

    if (!merID || !hashKey || !hashIV) {
      return NextResponse.json({ error: "missing_payuni_config" }, { status: 500 });
    }

    const siteUrl    = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const tradeNo    = `INREC${Date.now()}`;

    // Payuni 整合式支付頁（upp）必填：MerID、MerTradeNo、TradeAmt、Timestamp
    const orderParams = {
      MerID:      merID,
      MerTradeNo: tradeNo,
      TradeAmt:   String(price),
      Timestamp:  String(Math.floor(Date.now() / 1000)),
      ProdDesc:   (label || "零基礎流行鋼琴入門課").slice(0, 100),
      ReturnURL:  `${siteUrl}/api/payuni/return`,
      NotifyURL:  `${siteUrl}/api/payuni/notify`,
    };

    // 以 application/x-www-form-urlencoded 組成 query string（與 PHP http_build_query 對應）
    const qs = new URLSearchParams(orderParams).toString();

    const encryptInfo = aesEncrypt(qs, hashKey, hashIV);
    const hashInfo    = makeHashInfo(encryptInfo, hashKey, hashIV);
    const payuniUrl   = process.env.PAYUNI_API_URL || "https://sandbox-api.payuni.com.tw/api/upp";

    // 建立 pending 訂單記錄
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { error } = await supabase.from("orders").insert({
        plan,
        plan_label:   label || plan,
        amount:       Number(price),
        currency:     "twd",
        mer_trade_no: tradeNo,
        email,
        status:       "pending",
        buyer_name:   buyerName || null,
        buyer_tax_id: buyerTaxId || null,
        carrier_type: carrierType || null,
        carrier_id:   carrierId || null,
        coupon_code:  couponCode || null,
      });
      if (error) console.error("[payuni checkout] supabase error", error.message);
    }

    return NextResponse.json({
      url: payuniUrl,
      fields: { MerID: merID, Version: "1.0", EncryptInfo: encryptInfo, HashInfo: hashInfo },
    });
  } catch (err) {
    console.error("[payuni checkout error]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
