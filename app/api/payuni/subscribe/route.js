import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";

function aesEncrypt(plaintext, key, iv) {
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(key, "utf8"), Buffer.from(iv, "utf8"));
  let enc = cipher.update(plaintext, "utf8", "hex");
  enc += cipher.final("hex");
  return enc;
}

function makeHashInfo(encryptInfo, key, iv) {
  return crypto
    .createHash("sha256")
    .update(`HashKey=${key}&EncryptInfo=${encryptInfo}&HashIV=${iv}`)
    .digest("hex")
    .toUpperCase();
}

const SUBSCRIPTION_PLANS = {
  monthly: { price: 399,  label: "AI 遊戲訂閱 月繳方案" },
  yearly:  { price: 1499, label: "AI 遊戲訂閱 年繳方案" },
};

export async function POST(req) {
  try {
    const { plan, email } = await req.json();
    if (!plan || !email || !SUBSCRIPTION_PLANS[plan]) {
      return NextResponse.json({ error: "missing_params" }, { status: 400 });
    }

    const { price, label } = SUBSCRIPTION_PLANS[plan];
    const merID   = process.env.PAYUNI_MERCHANT_ID;
    const hashKey = process.env.PAYUNI_HASH_KEY;
    const hashIV  = process.env.PAYUNI_HASH_IV;
    if (!merID || !hashKey || !hashIV) {
      return NextResponse.json({ error: "missing_payuni_config" }, { status: 500 });
    }

    const siteUrl    = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const tradeNo    = `INRECSUB${Date.now()}`;
    const tomorrow   = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const expireDate = tomorrow.toISOString().slice(0, 10).replace(/-/g, "");

    const orderParams = {
      Desc:       label,
      ExpireDate: expireDate,
      MerID:      merID,
      MerTradeNo: tradeNo,
      NotifyURL:  `${siteUrl}/api/payuni/notify`,
      PayType:    "ALL",
      ReturnURL:  `${siteUrl}/classroom`,
      TradeAmt:   String(price),
    };

    const qs          = Object.keys(orderParams).sort().map(k => `${k}=${orderParams[k]}`).join("&");
    const encryptInfo = aesEncrypt(qs, hashKey, hashIV);
    const hashInfo    = makeHashInfo(encryptInfo, hashKey, hashIV);
    const payuniUrl   = process.env.PAYUNI_API_URL || "https://sandbox-api.payuni.com.tw/api/upp";

    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { error } = await supabase.from("orders").insert({
        plan:         `sub_${plan}`,
        plan_label:   label,
        amount:       price,
        currency:     "twd",
        mer_trade_no: tradeNo,
        email,
        status:       "pending",
      });
      if (error) console.error("[payuni subscribe] supabase error", error.message);
    }

    return NextResponse.json({
      url:    payuniUrl,
      fields: { MerID: merID, Version: "1.0", EncryptInfo: encryptInfo, HashInfo: hashInfo },
    });
  } catch (err) {
    console.error("[payuni subscribe error]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
