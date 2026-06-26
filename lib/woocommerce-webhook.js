// lib/woocommerce-webhook.js — WooCommerce webhook 核心判斷（依賴注入 supabase，可測）。
// 路由(app/api/webhook/woocommerce)只負責讀 req/env 並呼叫此函式。
import { verifyWooSignature, extractCourseOrder } from "./woocommerce.js";

// 回 { status, body }。流程：缺secret→500；缺簽章(ping)→200；驗章失敗→401；
// 非JSON/非付款/無課程→200不寫入；課程訂單→upsert 進名單(source=wordpress,status=paid)。
export async function handleWoocommerceWebhook({ rawBody, signature, secret, productMap, supabase, source = "wordpress" }) {
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
  return { status: 200, body: "OK" };
}
