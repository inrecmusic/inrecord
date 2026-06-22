// WooCommerce 訂單 webhook：付款成功 → 寫入 InRecord「付款名單」(orders, source=wordpress)。
// 不寄信、不開通；寄信/開通改由後台手動觸發。判斷邏輯在 lib/woocommerce-webhook（可測）。
import { getSupabaseAdmin } from "@/lib/supabase";
import { parseCourseProductMap } from "@/lib/woocommerce";
import { handleWoocommerceWebhook } from "@/lib/woocommerce-webhook";

export const runtime = "nodejs"; // 需 node crypto 與原始 body 驗 HMAC

export async function POST(req) {
  const rawBody = await req.text();
  const { status, body } = await handleWoocommerceWebhook({
    rawBody,
    signature: req.headers.get("x-wc-webhook-signature"),
    secret: process.env.WOOCOMMERCE_WEBHOOK_SECRET,
    productMap: parseCourseProductMap(process.env.WOOCOMMERCE_COURSE_PRODUCT_IDS),
    supabase: getSupabaseAdmin(),
  });
  return new Response(body, { status });
}
