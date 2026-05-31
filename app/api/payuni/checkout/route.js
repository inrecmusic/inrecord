import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";

// Payuni 統一金流 AES-256-CBC 加密
function aesEncrypt(plaintext, key, iv) {
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(key, "utf8"),
    Buffer.from(iv, "utf8")
  );
  let enc = cipher.update(plaintext, "utf8", "hex");
  enc += cipher.final("hex");
  return enc;
}

// Payuni SHA256 驗證碼
function makeHashInfo(encryptInfo, key, iv) {
  return crypto
    .createHash("sha256")
    .update(`HashKey=${key}&EncryptInfo=${encryptInfo}&HashIV=${iv}`)
    .digest("hex")
    .toUpperCase();
}

export async function POST(req) {
  try {
    const { plan, price, label, email } = await req.json();

    if (!plan || !price || !email) return NextResponse.json({ error: "missing_params" }, { status: 400 });

    const merID   = process.env.PAYUNI_MERCHANT_ID;
    const hashKey = process.env.PAYUNI_HASH_KEY;
    const hashIV  = process.env.PAYUNI_HASH_IV;

    if (!merID || !hashKey || !hashIV) {
      return NextResponse.json({ error: "missing_payuni_config" }, { status: 500 });
    }

    const siteUrl    = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const tradeNo    = `INREC${Date.now()}`;
    const tomorrow   = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const expireDate = tomorrow.toISOString().slice(0, 10).replace(/-/g, "");

    const orderParams = {
      Desc:       (label || "零基礎流行鋼琴入門課").slice(0, 100),
      ExpireDate: expireDate,
      MerID:      merID,
      MerTradeNo: tradeNo,
      NotifyURL:  `${siteUrl}/api/payuni/notify`,
      PayType:    "ALL",
      ReturnURL:  `${siteUrl}/success`,
      TradeAmt:   String(price),
    };

    // 依 key 排序後組成 query string
    const qs = Object.keys(orderParams)
      .sort()
      .map(k => `${k}=${orderParams[k]}`)
      .join("&");

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
