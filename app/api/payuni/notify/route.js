import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createInvoice } from "@/lib/amego-invoice";
import { sendPurchaseEmail } from "@/lib/brevo-email";
import { needsFulfillment, needsInvoice, autoInvoiceEnabled, autoGrantEnabled } from "@/lib/order-fulfillment";
import { grantAccess } from "@/lib/fulfillment-grant";
import { getSaleSettings, isPresale } from "@/lib/sale";
import { buildAdminAlertHtml, sendAdminAlert } from "@/lib/admin-alert";
import { hashEqual, interpretPayment } from "@/lib/payuni";
import { sendPurchase } from "@/lib/meta-capi";

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
        const { data: prior, error: priorError } = await supabase
          .from("orders").select("status, amount").eq("mer_trade_no", params.MerTradeNo).maybeSingle();

        // DB 錯誤（非「查無此單」，maybeSingle 查無資料時 error 為 null）：不可與「真的查無訂單」
        // 混為一談回 SUCCESS，否則暫時性資料庫錯誤會讓真實付款被永久略過、且無任何訊號。
        // 回 FAIL 讓 PAYUNi 依重送機制重試，並先告警供人工留意。
        if (priorError) {
          console.error("[payuni notify] 讀取訂單失敗（DB 錯誤）", params.MerTradeNo, priorError.message);
          try {
            await sendAdminAlert(buildAdminAlertHtml({
              kind: "notify_db_error",
              order: { mer_trade_no: params.MerTradeNo },
              reason: priorError.message || "讀取訂單時發生資料庫錯誤",
            }));
          } catch (e) {
            console.error("[admin alert error]", e);
          }
          return new Response("FAIL", { status: 500 });
        }

        const pay = interpretPayment(prior, params.TradeAmt);

        // 未知訂單：notify 的 MerTradeNo 在 DB 找不到 → 不可憑空 upsert 出 plan/email 為 NULL 的孤兒單。
        if (!pay.known) {
          console.error("[payuni notify] 未知訂單，略過不建立", params.MerTradeNo);
          try {
            await sendAdminAlert(buildAdminAlertHtml({
              kind: "unknown_order",
              order: { mer_trade_no: params.MerTradeNo },
              reason: "收到 PayUni notify 但查無對應訂單",
            }));
          } catch (e) {
            console.error("[admin alert error]", e);
          }
          return new Response("SUCCESS"); // 對 PAYUNi 回 SUCCESS 避免重送轟炸；已記錄+告警供查
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
         .neq("status", "refunded")  // 已退款訂單不可被遲到/重送的 notify 翻回 paid 並重新開通
         .select("id, email, grant_email, plan, plan_label, amount, buyer_name, buyer_tax_id, carrier_type, carrier_id, invoice_no, coupon_code, fulfilled_at, attribution, capi_data").single();
        // 更新未命中（訂單不存在，或已退款被守衛擋下）→ 不開通、不履約、不開票，直接回 SUCCESS
        if (!order) {
          console.error("[payuni notify] 略過：訂單不存在或已退款，不重新開通", params.MerTradeNo, error?.message || "");
          return new Response("SUCCESS");
        }
        let invoiceFailed = false, invoiceReason = "";
        let emailFailed = false,   emailReason   = "";
        // 自動開通（fail-safe 預設關）：官網直購改為付款後不自動開通、由後台手動開通。
        // 設 AUTO_GRANT_ACCESS=on 才恢復付款即開通。開關 off 時本段整段跳過。
        if (autoGrantEnabled() && order?.email) {
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
            // Meta CAPI 伺服器端 Purchase（best-effort、guarded；與瀏覽器 Pixel 靠 event_id=mer_trade_no 去重）。
            try {
              const capi = await sendPurchase({
                merTradeNo: params.MerTradeNo, amount: order.amount, plan: order.plan,
                email: order.email, capiData: order.capi_data, attribution: order.attribution,
              });
              if (capi && capi.ok === false && capi.error) console.error("[capi]", params.MerTradeNo, capi.error);
            } catch (e) {
              console.error("[capi] threw", params.MerTradeNo, e?.message || e);
            }

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
                // 不自動開通時，信一律「預購成功、開通後 Email 通知」文案（開通改人工）。
                presale:    !autoGrantEnabled() ? true : isPresale(saleSettings, new Date()),
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

        // 開立發票：預設關閉（AUTO_INVOICE=on 才自動開票）。
        // 目前發票由人員依 PAYUNi 訂單記錄人工開立（尚未申請電子發票票匭），避免自動開出測試假發票／與人工重複開立。
        // 待 Amego 切正式＋申請票匭後設 AUTO_INVOICE=on 恢復。以 invoice_no 作為去重旗標，開票失敗時可隨後重試。
        if (autoInvoiceEnabled() && needsInvoice(order)) {
          // 原子 claim 防並發／重送重複開票：把 invoice_claimed_at NULL→now，只有搶到的請求才呼叫 Amego。
          // （needsInvoice 只讀進來當下的 invoice_no，屬 check-then-act；並發時多個 notify 會同時通過，故需此 CAS。）
          const { data: invClaim } = await supabase
            .from("orders")
            .update({ invoice_claimed_at: new Date().toISOString() })
            .eq("id", order.id)
            .is("invoice_no", null)
            .is("invoice_claimed_at", null)
            .select("id")
            .maybeSingle();

          if (invClaim) {
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
              // 開票失敗：清掉 claim，讓後續重送 notify／後台可再次開票（保留「失敗可重試」語意）
              await supabase
                .from("orders")
                .update({ invoice_error: invoiceReason, invoice_claimed_at: null })
                .eq("id", order.id);
              console.error("[Invoice] 開立失敗:", invoiceResult.error);
            }
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
