import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { PLAN_CATALOG, applyCoupon, couponError, couponPlanError } from "@/lib/plans";
import { currentPrice, getSaleSettings, isOnSale, fanCouponActive, FAN_COUPON_CODE } from "@/lib/sale";
import { releaseOwnPendingCouponHolds } from "@/lib/coupon-hold";
import { verifyCarrier, verifyTaxId } from "@/lib/amego-verify";
import { MOBILE_CARRIER_TYPE, isValidTaxId, isValidMobileBarcode } from "@/lib/invoice-fields";
import { isOwnProofUrl } from "@/lib/fan-proof";
import { createDistributedLimiter, clientIp } from "@/lib/rate-limit";

// 公開下單端點限流：擋洗 pending 單、灌爆 Amego/稅務查詢、當優惠券預言機、燒序號庫存。
const checkoutLimiter = createDistributedLimiter({ limit: 10, windowMs: 60_000, prefix: "rl:checkout" });

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
  // 優惠券原子預扣的狀態（hoist 到 try 外，讓 catch 也能釋放）
  let couponCode = null;
  let couponPrevUsed = 0;
  let couponClaimed = false;
  try {
    const rl = await checkoutLimiter(clientIp(req));
    if (!rl.allowed) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
    }
    const body = await req.json();
    // 後台「測試 Payuni 連線」用：只檢查金流設定是否齊全，不建立訂單（避免每次測試都灌一筆垃圾 pending 單）。
    if (body.dryRun) {
      const configured = !!(process.env.PAYUNI_MERCHANT_ID && process.env.PAYUNI_HASH_KEY && process.env.PAYUNI_HASH_IV);
      return NextResponse.json(configured ? { ok: true } : { error: "missing_payuni_config" }, { status: configured ? 200 : 500 });
    }
    const { plan, email, proofUrl } = body;
    const attribution = body.attribution || null;

    // 1) 方案合法性 + 價格/品名一律由後端決定
    const catalog = PLAN_CATALOG[plan];
    if (!catalog || catalog.sellable === false) return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
    if (!email || typeof email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    }
    const saleSettings = await getSaleSettings();
    const label = catalog.label;

    // 先取得並驗證優惠券（讓有效「指定價」券可繞過開賣前封鎖）
    let coupon = null;
    const sb = getSupabaseAdmin();
    if (body.couponCode && sb) {
      const code = String(body.couponCode).trim().toUpperCase();
      const { data } = await sb.from("coupons").select("*").eq("code", code).maybeSingle();
      coupon = data;
      const cErr = couponError(coupon);
      if (cErr) return NextResponse.json({ error: cErr }, { status: 400 });
      const pErr = couponPlanError(coupon, plan);
      if (pErr) return NextResponse.json({ error: pErr }, { status: 400 });
      // 粉絲直購券綁 fan_plan 截止（預設 9/9 23:59）：過期或方案停用即拒收，與首頁隱藏粉絲卡同步
      if (coupon.code === FAN_COUPON_CODE && !fanCouponActive(saleSettings, new Date())) {
        return NextResponse.json({ error: "coupon_expired" }, { status: 400 });
      }
    }

    // pre_launch：僅在有有效「指定價」券時放行（一般購買未開）
    const hasPriceCoupon = !!(coupon && coupon.type === "price");
    if (!isOnSale(saleSettings, new Date()) && !hasPriceCoupon) {
      return NextResponse.json({ error: "not_on_sale" }, { status: 400 });
    }

    let price = currentPrice(plan, saleSettings, new Date());

    // 這裡只算折扣價、先不預扣額度。限量券（序號 usage_limit=1）的原子預扣延到「所有驗證通過、
    // 緊接寫單前」才做——否則中途任何 early-return（價格過低／發票欄位錯／設定缺）都會把序號永久
    // 燒掉，而此刻訂單還沒建、逾時回收 cron 也掃不到 → 無法回收。
    if (coupon) {
      price = applyCoupon(price, coupon);
      couponCode = coupon.code;
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
      if (!isValidMobileBarcode(cid)) return NextResponse.json({ error: "invalid_carrier_id" }, { status: 400 });
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
      ProdDesc:   (label || "從零開始學鋼琴").slice(0, 100),
      ReturnURL:  `${siteUrl}/api/payuni/return`,
      NotifyURL:  `${siteUrl}/api/payuni/notify`,
    };

    // 以 application/x-www-form-urlencoded 組成 query string（與 PHP http_build_query 對應）
    const qs = new URLSearchParams(orderParams).toString();

    const encryptInfo = aesEncrypt(qs, hashKey, hashIV);
    const hashInfo    = makeHashInfo(encryptInfo, hashKey, hashIV);
    const payuniUrl   = process.env.PAYUNI_API_URL || "https://sandbox-api.payuni.com.tw/api/upp";

    // 建立 pending 訂單記錄
    // 只白名單 fbp/fbc（型別+長度限制，避免客戶端塞任意資料進 jsonb / 送 Meta）；ip/ua 由 server 設定壓過
    const src = (body.capiClient && typeof body.capiClient === "object" && !Array.isArray(body.capiClient)) ? body.capiClient : {};
    const fbp = typeof src.fbp === "string" && src.fbp.length <= 128 ? src.fbp : undefined;
    const fbc = typeof src.fbc === "string" && src.fbc.length <= 256 ? src.fbc : undefined;
    const capi_data = { ...(fbp ? { fbp } : {}), ...(fbc ? { fbc } : {}), ip: clientIp(req), ua: (req.headers.get("user-agent") || "").slice(0, 512) || undefined };
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      console.error("[payuni checkout] supabase admin unavailable，訂單無法寫入，拒絕吐出付款欄位");
      // 沒有 DB 連線就不能吐出可付款的 EncryptInfo/HashInfo，否則顧客能真的付款但 DB 完全查無此單（靜默漏款）。
      return NextResponse.json({ error: "order_create_failed" }, { status: 500 });
    }

    // 限量券原子預扣（CAS）：延到此刻（所有驗證已過、緊接寫單）才扣，之後唯一失敗路徑就是下方 insert，
    // 失敗即釋放；杜絕中途 early-return 漏扣。
    if (coupon && coupon.usage_limit != null) {
      // 同一買家用同一張限量券重試（上次到 PayUni 放棄）：先作廢自己仍 pending 的舊單並退回預扣，
      // 否則會被自己的舊單卡成 coupon_used_up、要等 release-coupons cron 逾時（72h）才解。
      await releaseOwnPendingCouponHolds(supabase, { email, couponCode: coupon.code });
      // 以最新 used 做 CAS 預扣（上面可能剛釋放；同一瞬間被別人搶走就重讀再試一次）
      let claimedOk = false;
      for (let attempt = 0; attempt < 2 && !claimedOk; attempt++) {
        const { data: fresh } = await supabase.from("coupons").select("used, usage_limit").eq("code", coupon.code).maybeSingle();
        const prevUsed = fresh?.used ?? coupon.used ?? 0;
        if (prevUsed >= (fresh?.usage_limit ?? coupon.usage_limit)) break;
        const { data: claimed } = await supabase
          .from("coupons").update({ used: prevUsed + 1 })
          .eq("code", coupon.code).eq("used", prevUsed).select("id");
        if (claimed && claimed.length) { couponPrevUsed = prevUsed; claimedOk = true; }
      }
      if (!claimedOk) return NextResponse.json({ error: "coupon_used_up" }, { status: 400 });
      couponClaimed = true;
    }

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
      attribution,
      capi_data,
      ...(isOwnProofUrl(proofUrl, process.env.NEXT_PUBLIC_SUPABASE_URL) ? { proof_url: proofUrl, fan_review: "pending" } : {}),
    });
    if (error) {
      console.error("[payuni checkout] supabase error", error.message);
      // 訂單沒寫進去 → 釋放剛才預扣的限量券額度（CAS 還原本人那一次）
      if (couponClaimed) {
        await supabase.from("coupons").update({ used: couponPrevUsed })
          .eq("code", couponCode).eq("used", couponPrevUsed + 1);
      }
      // 訂單沒寫進去就不能吐出可付款的 EncryptInfo/HashInfo，否則顧客能真的付款但 DB 查無此單（靜默漏款）。
      return NextResponse.json({ error: "order_create_failed" }, { status: 500 });
    }

    return NextResponse.json({
      url: payuniUrl,
      fields: { MerID: merID, Version: "1.0", EncryptInfo: encryptInfo, HashInfo: hashInfo },
    });
  } catch (err) {
    console.error("[payuni checkout error]", err);
    // 例外中斷 → 釋放已預扣的限量券額度（best-effort）
    if (couponClaimed) {
      try {
        const sb = getSupabaseAdmin();
        if (sb) await sb.from("coupons").update({ used: couponPrevUsed })
          .eq("code", couponCode).eq("used", couponPrevUsed + 1);
      } catch {}
    }
    return NextResponse.json({ error: "checkout_failed" }, { status: 500 });
  }
}
