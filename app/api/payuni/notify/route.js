import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createInvoice } from "@/lib/amego-invoice";
import { sendPurchaseEmail } from "@/lib/brevo-email";

// Payuni AES-256-GCM 解密：輸入為 hex( base64(密文) + ':::' + base64(GCM tag) )
function aesDecrypt(encryptStr, key, iv) {
  const combined = Buffer.from(encryptStr, "hex").toString("utf8");
  const [ctB64, tagB64] = combined.split(":::");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "utf8"),
    Buffer.from(iv, "utf8")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  let dec = decipher.update(ctB64, "base64", "utf8");
  dec += decipher.final("utf8");
  return dec;
}

// Payuni SHA256 驗證碼：SHA256(HashKey + EncryptInfo + HashIV) 轉大寫
function makeHashInfo(encryptInfo, key, iv) {
  return crypto
    .createHash("sha256")
    .update(key + encryptInfo + iv)
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

    // 解密後 TradeStatus = 1 代表付款成功（外層 Status 為 'SUCCESS'）
    if (params.TradeStatus === "1") {
      console.log("[payuni paid]", params.MerTradeNo, params.TradeAmt);

      const supabase = getSupabaseAdmin();
      if (supabase) {
        const { data: order, error } = await supabase.from("orders").upsert(
          {
            mer_trade_no:    params.MerTradeNo,
            payuni_trade_no: params.TradeNo,
            amount:          Number(params.TradeAmt),
            pay_type:        params.PaymentType || params.PayType || null,
            status:          "paid",
            updated_at:      new Date().toISOString(),
          },
          { onConflict: "mer_trade_no" }
        ).select("id, email, plan, plan_label, amount, buyer_name, buyer_tax_id, carrier_type, carrier_id, invoice_no").single();
        if (error) {
          console.error("[payuni notify] supabase error", error.message);
        } else if (order?.email) {
          const PERMANENT = "2999-12-31T00:00:00.000Z";

          // 課程開通（課程單賣 or 課程包）
          if (order.plan === "course" || order.plan === "bundle") {
            const { error: enrollErr } = await supabase.from("enrollments").upsert(
              { email: order.email, course_id: "piano-101", order_id: order.id },
              { onConflict: "email,course_id" }
            );
            if (enrollErr) console.error("[payuni notify] enroll error", enrollErr.message);
          }

          // AI 遊戲永久開通（遊戲單買 or 課程包）；以遠期到期日表示永久
          if (order.plan === "game" || order.plan === "bundle") {
            const { count: gameExists } = await supabase
              .from("subscriptions")
              .select("id", { count: "exact", head: true })
              .eq("email", order.email)
              .eq("source", "purchase")
              .eq("payuni_order_id", order.id);

            if (!gameExists) {
              const { error: gameErr } = await supabase.from("subscriptions").insert({
                email:           order.email,
                plan_type:       order.plan === "bundle" ? "bundle" : "game",
                status:          "active",
                expires_at:      PERMANENT,
                source:          "purchase",
                payuni_order_id: order.id,
              });
              if (gameErr) console.error("[payuni notify] game access insert error", gameErr.message);
            }
          }
        }

        // 首次成功處理此訂單（尚未開發票）才執行：寄開課確認信 + 開發票
        // 以 invoice_no 作為去重標記，避免 Payuni 重送 notify 時重複寄信／重複開票
        if (order?.id && !order.invoice_no) {
          // 寄送購買成功開課確認信（Brevo transactional）— 失敗不中斷
          if (order.email) {
            const mailResult = await sendPurchaseEmail({
              email:      order.email,
              plan:       order.plan,
              planLabel:  order.plan_label,
              merTradeNo: params.MerTradeNo,
            });
            if (mailResult.success) {
              console.log("[mail] 開課確認信已寄出:", order.email, mailResult.messageId || "");
            } else if (!mailResult.skipped) {
              console.error("[mail] 開課確認信寄送失敗:", mailResult.error);
            }
          }

          const invoiceResult = await createInvoice({
            orderId: order.id,
            buyerName: order.buyer_name || "學員",
            buyerEmail: order.email,
            buyerTaxId: order.buyer_tax_id || null,
            amount: order.amount,
            productName: order.plan_label || "零基礎流行鋼琴入門課",
            carrierType: order.carrier_type || "",
            carrierId: order.carrier_id || "",
          });

          if (invoiceResult.success) {
            await supabase
              .from("orders")
              .update({ invoice_no: invoiceResult.invoiceNo })
              .eq("id", order.id);
            console.log("[Invoice] 開立成功:", invoiceResult.invoiceNo);
          } else {
            console.error("[Invoice] 開立失敗:", invoiceResult.error);
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
