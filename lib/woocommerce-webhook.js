// lib/woocommerce-webhook.js — WooCommerce webhook 核心判斷（依賴注入 supabase，可測）。
// 路由(app/api/webhook/woocommerce)只負責讀 req/env 並呼叫此函式。
import { verifyWooSignature, extractCourseOrder } from "./woocommerce.js";

// 回 { status, body }。流程：缺secret→500；缺簽章(ping)→200；驗章失敗→401；
// 非JSON/非付款/無課程→200不寫入；課程訂單→upsert 進名單(source=wordpress,status=paid)
// →（若注入 sendEmail）自動寄預購成功信。
//
// sendEmail({ email, plan, planLabel, merTradeNo }) 由路由注入（presale 文案在路由層算），
// 依賴注入讓本函式維持可單元測試。只有「已付款」訂單走得到這裡（extractCourseOrder 以
// PAID_STATUSES=processing/completed 把關，未付款/取消單不入名單也不寄信）。
export async function handleWoocommerceWebhook({ rawBody, signature, secret, productMap, supabase, source = "wordpress", sendEmail }) {
  if (!secret) {
    console.error("[woo webhook] 缺 WOOCOMMERCE_WEBHOOK_SECRET");
    return { status: 500, body: "FAIL" };
  }
  // WooCommerce 首次儲存 webhook 會送無簽章的連線測試（ping）→ 回 200，不處理。
  if (!signature) return { status: 200, body: "OK" };
  if (!verifyWooSignature(rawBody, signature, secret)) {
    console.error("[woo webhook] 簽章不符");
    return { status: 401, body: "FAIL" };
  }

  let order;
  try {
    order = JSON.parse(rawBody);
  } catch {
    return { status: 200, body: "OK" }; // 非 JSON（探測）→ 不報錯
  }

  // 掃 line_items 挑出課程那一項（周邊忽略）；非付款/無課程/缺 email → 不處理。
  // 來源決定 mer_trade_no 前綴：concert-shop=CC、WooCommerce=WC，避免跨站同訂單號碰撞。
  const course = extractCourseOrder(order, productMap, source === "concert" ? "CC" : "WC");
  if (!course) return { status: 200, body: "OK" };
  if (!supabase) return { status: 200, body: "OK" }; // 未配置 DB → 不寫入但不報錯

  // 只記非敏感欄位（避免買家 PII 落入 logs）
  console.log("[woo webhook] course order", {
    merTradeNo: course.merTradeNo,
    plan: course.plan,
    amount: course.amount,
  });

  // 進名單：冪等 — mer_trade_no 唯一 + ignoreDuplicates(ON CONFLICT DO NOTHING)，重送不重複/不覆蓋旗標。
  const { error } = await supabase.from("orders").upsert(
    {
      mer_trade_no: course.merTradeNo,
      email:        course.email,
      phone:        course.phone || null,
      plan:         course.plan,
      plan_label:   course.planLabel,
      amount:       course.amount,
      currency:     "twd",
      status:       "paid",
      source,
    },
    { onConflict: "mer_trade_no", ignoreDuplicates: true }
  );
  if (error) {
    console.error("[woo webhook] orders upsert error", error.message);
    return { status: 500, body: "FAIL" };
  }

  // 自動寄預購成功信（2026-07-07 起，取代純手動）。訂單已確認付款（見上方把關）。
  // 原子 claim presale_email_sent_at（UPDATE ... WHERE IS NULL）防 webhook 重送重複寄；
  // 失敗/跳過 → 回滾旗標讓後台名單維持「未寄」，可用既有「寄預購信」按鈕重寄。
  // 寄信任何結果都不影響 webhook 回應 —— 訂單已入名單為準。
  if (sendEmail) {
    try {
      const { data: claimed } = await supabase
        .from("orders")
        .update({ presale_email_sent_at: new Date().toISOString() })
        .eq("mer_trade_no", course.merTradeNo)
        .is("presale_email_sent_at", null)
        .select("id")
        .maybeSingle();

      if (claimed) {
        let result;
        try {
          result = await sendEmail({
            email:      course.email,
            plan:       course.plan,
            planLabel:  course.planLabel,
            merTradeNo: course.merTradeNo,
          });
        } catch (e) {
          result = { success: false, error: String(e?.message || e) };
        }

        if (result?.success) {
          await supabase.from("orders").update({ email_error: null }).eq("id", claimed.id);
          console.log("[woo webhook] 預購成功信已寄出", course.merTradeNo);
        } else {
          const rollback = { presale_email_sent_at: null };
          if (!result?.skipped) rollback.email_error = result?.error || "send_failed";
          await supabase.from("orders").update(rollback).eq("id", claimed.id);
          console.error("[woo webhook] 預購信寄送失敗，已回滾旗標", course.merTradeNo, result?.error || "skipped");
        }
      }
    } catch (e) {
      console.error("[woo webhook] 預購信流程錯誤（不影響入名單）", e);
    }
  }

  return { status: 200, body: "OK" };
}
