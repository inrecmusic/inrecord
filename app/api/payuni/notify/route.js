import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createInvoice } from "@/lib/amego-invoice";
import { sendPurchaseEmail } from "@/lib/brevo-email";
import { needsFulfillment, needsInvoice } from "@/lib/order-fulfillment";
import { grantAccess } from "@/lib/fulfillment-grant";
import { getSaleSettings, isPresale } from "@/lib/sale";
import { buildAdminAlertHtml, sendAdminAlert } from "@/lib/admin-alert";
import { hashEqual, interpretPayment } from "@/lib/payuni";

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
    let body;
    try {
      body = await req.formData();
    } catch {
      // 非表單格式（垃圾/探測請求）→ 乾淨回 400，而非 500
      return new Response("FAIL", { status: 400 });
    }
    const encryptInfo = body.get("EncryptInfo");
    const hashInfo    = body.get("HashInfo");

    // 缺必要欄位（非真實 PAYUNi 回呼）→ 400
    if (!encryptInfo || !hashInfo) {
      return new Response("FAIL", { status: 400 });
    }

    const hashKey = process.env.PAYUNI_HASH_KEY;
    const hashIV  = process.env.PAYUNI_HASH_IV;

    if (!hashKey || !hashIV) {
      console.error("[payuni notify] missing config");
      return new Response("FAIL", { status: 500 });
    }

    // 驗證 HashInfo（定值時間比對）
    const expected = makeHashInfo(encryptInfo, hashKey, hashIV);
    if (!hashEqual(expected, String(hashInfo))) {
      console.error("[payuni notify] hash mismatch");
      return new Response("FAIL", { status: 400 });
    }

    const plaintext = aesDecrypt(encryptInfo, hashKey, hashIV);
    const params    = Object.fromEntries(new URLSearchParams(plaintext));
    // 只記非敏感欄位，避免買家 PII（email/姓名/載具）落入 Vercel logs
    console.log("[payuni notify]", {
      MerTradeNo:  params.MerTradeNo,
      TradeNo:     params.TradeNo,
      TradeStatus: params.TradeStatus,
      TradeAmt:    params.TradeAmt,
      PaymentType: params.PaymentType || params.PayType,
    });

    // 解密後 TradeStatus = 1 代表付款成功（外層 Status 為 'SUCCESS'）
    if (params.TradeStatus === "1") {
      console.log("[payuni paid]", params.MerTradeNo, params.TradeAmt);

      const supabase = getSupabaseAdmin();
      if (supabase) {
        // 先讀原訂單（狀態 + 下單金額）。若此訂單曾被「逾時釋放」標記 expired（見 cron/release-coupons），
        // 付款仍要認（顧客已付錢），但限量券的預扣已被退回，稍後需補回扣抵 + 告警。
        const { data: prior } = await supabase
          .from("orders").select("status, amount").eq("mer_trade_no", params.MerTradeNo).maybeSingle();
        const pay = interpretPayment(prior, params.TradeAmt);

        // 未知訂單：notify 的 MerTradeNo 在 DB 找不到 → 不可憑空 upsert 出 plan/email 為 NULL 的孤兒單。
        if (!pay.known) {
          console.error("[payuni notify] 未知訂單，略過不建立", params.MerTradeNo);
          return new Response("SUCCESS"); // 對 PAYUNi 回 SUCCESS 避免重送轟炸；已記錄供查
        }
        if (!pay.amountValid) console.error("[payuni notify] TradeAmt 非數字，發票沿用下單金額", params.TradeAmt);
        if (pay.amountMismatch) console.error("[payuni notify] ⚠️ 付款金額與下單金額不符", { merTradeNo: params.MerTradeNo, paid: pay.paidAmt, order: pay.orderAmount });
        const wasExpired = prior.status === "expired";

        // 只更新既有訂單（不 upsert 建新單）；且不寫回呼金額 —— 訂單金額一律以下單金額為準，
        // 避免把 NaN 或被竄改的回呼金額寫入並據以開發票。
        const { data: order, error } = await supabase.from("orders").update(
          {
            payuni_trade_no: params.TradeNo,
            pay_type:        params.PaymentType || params.PayType || null,
            status:          "paid",
            updated_at:      new Date().toISOString(),
          }
        ).eq("mer_trade_no", params.MerTradeNo)
         .select("id, email, plan, plan_label, amount, buyer_name, buyer_tax_id, carrier_type, carrier_id, invoice_no, coupon_code, fulfilled_at").single();
        let invoiceFailed = false, invoiceReason = "";
        let emailFailed = false,   emailReason   = "";
        if (error) {
          console.error("[payuni notify] supabase error", error.message);
        } else if (order?.email) {
          // 課程／遊戲存取開通（共用 lib/fulfillment-grant，與後台手動開通同一來源）。
          // ⚠️ 冪等：enrollments(onConflict email,course_id) + subscriptions(onConflict payuni_order_id,
          //   ignoreDuplicates) 確保 Payuni 並發／重送 notify 不會重複開通。
          //   subscriptions 需搭配唯一索引 uniq_sub_purchase_order（見 supabase-hardening.sql）。
          const grant = await grantAccess(supabase, order);
          if (!grant.ok) console.error("[payuni notify] grantAccess error", grant.errors.join("; "));
        }

        // 一次性履約（優惠券累計 + 寄開課信）：以 fulfilled_at 作為去重旗標。
        // 與開發票分離 —— 開發票可能反覆失敗重試，不能讓它連帶造成優惠券重複累計／重複寄信。
        //
        // ⚠️ 原子性：用「條件式 claim」（UPDATE ... WHERE fulfilled_at IS NULL）取代先讀後寫，
        // 確保 Payuni 並發／重送 notify 時只有第一個請求拿得到 row、執行副作用，
        // 其餘拿到空 → 不重複累計優惠券、不重複寄信。needsFulfillment 僅作早退優化。
        if (needsFulfillment(order)) {
          const { data: claimed } = await supabase
            .from("orders")
            .update({ fulfilled_at: new Date().toISOString() })
            .eq("id", order.id)
            .is("fulfilled_at", null)
            .select("id")
            .maybeSingle();

          if (claimed) {
            // 優惠券使用次數累計：
            //   - 限量券：已在 checkout 原子預扣（防 TOCTOU 重複折抵），notify 不再加。
            //   - 無限量券：checkout 未預扣，此處補記已付使用數（純統計）。
            //   - 例外：若訂單曾逾時釋放(wasExpired)，限量券的預扣已被退回 →
            //           這裡補回一次，避免「釋放後付款」造成重複折抵。
            if (order.coupon_code) {
              const { data: c } = await supabase.from("coupons").select("used, usage_limit").eq("code", order.coupon_code).single();
              if (c && (c.usage_limit == null || wasExpired)) {
                await supabase.from("coupons").update({ used: (c.used || 0) + 1 }).eq("code", order.coupon_code);
              }
            }

            // 寄送購買成功開課確認信（Brevo transactional）— 失敗不中斷
            if (order.email) {
              const saleSettings = await getSaleSettings();
              const mailResult = await sendPurchaseEmail({
                email:      order.email,
                plan:       order.plan,
                planLabel:  order.plan_label,
                merTradeNo: params.MerTradeNo,
                presale:    isPresale(saleSettings, new Date()),
              });
              if (mailResult.success) {
                console.log("[mail] 開課確認信已寄出:", params.MerTradeNo, mailResult.messageId || "");
                await supabase.from("orders").update({ email_error: null }).eq("id", order.id);
              } else if (!mailResult.skipped) {
                console.error("[mail] 開課確認信寄送失敗:", mailResult.error);
                emailFailed = true;
                emailReason = mailResult.error || "send_failed";
                await supabase.from("orders").update({ email_error: emailReason }).eq("id", order.id);
              }
            }
          }
        }

        // 開立發票：以 invoice_no 作為去重旗標，可在開票失敗時隨後重試（手動或重送 notify）
        if (needsInvoice(order)) {
          const invoiceResult = await createInvoice({
            orderId: order.id,
            buyerName: order.buyer_name || "學員",
            buyerEmail: order.email,
            buyerTaxId: order.buyer_tax_id || null,
            amount: order.amount,
            productName: order.plan_label || "從零開始學鋼琴",
            carrierType: order.carrier_type || "",
            carrierId: order.carrier_id || "",
            trackApiCode: process.env.AMEGO_TRACK_API_CODE || "",
          });

          if (invoiceResult.success) {
            await supabase
              .from("orders")
              .update({ invoice_no: invoiceResult.invoiceNo, invoice_error: null })
              .eq("id", order.id);
            console.log("[Invoice] 開立成功:", invoiceResult.invoiceNo);
          } else {
            invoiceFailed = true;
            invoiceReason = invoiceResult.error || `code_${invoiceResult.code || "unknown"}`;
            await supabase
              .from("orders")
              .update({ invoice_error: invoiceReason })
              .eq("id", order.id);
            console.error("[Invoice] 開立失敗:", invoiceResult.error);
          }
        }

        // 開票／寄信失敗 → 主動寄信告警給管理員（失敗不影響付款回應）
        if (invoiceFailed || emailFailed) {
          try {
            const alertOrder = { mer_trade_no: params.MerTradeNo, email: order?.email };
            if (invoiceFailed) {
              await sendAdminAlert(buildAdminAlertHtml({ kind: "invoice", order: alertOrder, reason: invoiceReason }));
            }
            if (emailFailed) {
              await sendAdminAlert(buildAdminAlertHtml({ kind: "email", order: alertOrder, reason: emailReason }));
            }
          } catch (e) {
            console.error("[admin alert error]", e);
          }
        }

        // 逾時釋放後又收到付款 → 告警人工確認限量券用量（限量券已自動補回扣抵）
        if (wasExpired) {
          try {
            await sendAdminAlert(buildAdminAlertHtml({
              kind: "late_paid",
              order: { mer_trade_no: params.MerTradeNo, email: order?.email },
              reason: "訂單逾時釋放後仍收到付款；限量優惠券已自動補回扣抵，請確認用量無誤。",
            }));
          } catch (e) {
            console.error("[admin alert error]", e);
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
