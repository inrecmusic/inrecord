import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";

function aesDecrypt(hex, key, iv) {
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(key, "utf8"),
    Buffer.from(iv, "utf8")
  );
  let dec = decipher.update(hex, "hex", "utf8");
  dec += decipher.final("utf8");
  return dec;
}

function makeHashInfo(encryptInfo, key, iv) {
  return crypto
    .createHash("sha256")
    .update(`HashKey=${key}&EncryptInfo=${encryptInfo}&HashIV=${iv}`)
    .digest("hex")
    .toUpperCase();
}

// Payuni 背景通知（POST）
export async function POST(req) {
  try {
    const body        = await req.formData();
    const encryptInfo = body.get("EncryptInfo");
    const hashInfo    = body.get("HashInfo");

    const hashKey = process.env.PAYUNI_HASH_KEY;
    const hashIV  = process.env.PAYUNI_HASH_IV;

    if (!hashKey || !hashIV) {
      console.error("[payuni notify] missing config");
      return new Response("FAIL", { status: 500 });
    }

    // 驗證 HashInfo
    const expected = makeHashInfo(encryptInfo, hashKey, hashIV);
    if (expected !== hashInfo) {
      console.error("[payuni notify] hash mismatch");
      return new Response("FAIL", { status: 400 });
    }

    const plaintext = aesDecrypt(encryptInfo, hashKey, hashIV);
    const params    = Object.fromEntries(new URLSearchParams(plaintext));
    console.log("[payuni notify]", params);

    // Status 1 = 付款成功
    if (params.Status === "1") {
      console.log("[payuni paid]", params.MerTradeNo, params.TradeAmt);

      const supabase = getSupabaseAdmin();
      if (supabase) {
        const { error } = await supabase.from("orders").upsert(
          {
            mer_trade_no:    params.MerTradeNo,
            payuni_trade_no: params.TradeNo,
            amount:          Number(params.TradeAmt),
            pay_type:        params.PayType || null,
            status:          "paid",
            updated_at:      new Date().toISOString(),
          },
          { onConflict: "mer_trade_no" }
        );
        if (error) console.error("[payuni notify] supabase error", error.message);
      }
    }

    return new Response("SUCCESS", { status: 200 });
  } catch (err) {
    console.error("[payuni notify error]", err);
    return new Response("FAIL", { status: 500 });
  }
}
