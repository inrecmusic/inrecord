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
        const { data: order, error } = await supabase.from("orders").upsert(
          {
            mer_trade_no:    params.MerTradeNo,
            payuni_trade_no: params.TradeNo,
            amount:          Number(params.TradeAmt),
            pay_type:        params.PayType || null,
            status:          "paid",
            updated_at:      new Date().toISOString(),
          },
          { onConflict: "mer_trade_no" }
        ).select("id, email, plan").single();
        if (error) {
          console.error("[payuni notify] supabase error", error.message);
        } else if (order?.email) {
          const isSubscription = order.plan?.startsWith("sub_");

          if (!isSubscription) {
            // Course purchase: enroll + gift 3-month subscription
            const { error: enrollErr } = await supabase.from("enrollments").upsert(
              { email: order.email, course_id: "piano-101", order_id: order.id },
              { onConflict: "email,course_id" }
            );
            if (enrollErr) console.error("[payuni notify] enroll error", enrollErr.message);

            // Idempotency: only insert gift subscription once per order
            const { count: giftExists } = await supabase
              .from("subscriptions")
              .select("id", { count: "exact", head: true })
              .eq("email", order.email)
              .eq("source", "purchase_gift")
              .eq("payuni_order_id", order.id);

            if (!giftExists) {
              const giftExpiry = new Date();
              giftExpiry.setMonth(giftExpiry.getMonth() + 3);
              const { error: giftErr } = await supabase.from("subscriptions").insert({
                email:           order.email,
                plan_type:       "gift",
                status:          "active",
                expires_at:      giftExpiry.toISOString(),
                source:          "purchase_gift",
                payuni_order_id: order.id,
              });
              if (giftErr) console.error("[payuni notify] gift subscription error", giftErr.message);
            }
          } else {
            // Subscription payment: extend from existing expiry date
            // Idempotency: skip if TradeNo already processed
            const { count: subExists } = await supabase
              .from("subscriptions")
              .select("id", { count: "exact", head: true })
              .eq("payuni_order_id", params.TradeNo);

            if (!subExists) {
              const planKey = order.plan.replace("sub_", "");
              const { data: existing } = await supabase
                .from("subscriptions")
                .select("expires_at")
                .eq("email", order.email)
                .eq("status", "active")
                .gte("expires_at", new Date().toISOString())
                .order("expires_at", { ascending: false })
                .limit(1)
                .single();

              const baseDate = existing?.expires_at ? new Date(existing.expires_at) : new Date();
              if (planKey === "monthly") {
                baseDate.setMonth(baseDate.getMonth() + 1);
              } else {
                baseDate.setFullYear(baseDate.getFullYear() + 1);
              }

              const { error: subErr } = await supabase.from("subscriptions").insert({
                email:           order.email,
                plan_type:       planKey,
                status:          "active",
                expires_at:      baseDate.toISOString(),
                payuni_order_id: params.TradeNo,
                source:          "direct",
              });
              if (subErr) console.error("[payuni notify] subscription insert error", subErr.message);
            }
          }
        }
      }
    }

    return new Response("SUCCESS", { status: 200 });
  } catch (err) {
    console.error("[payuni notify error]", err);
    return new Response("FAIL", { status: 500 });
  }
}
