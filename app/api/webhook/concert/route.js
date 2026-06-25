// concert-shop（concert.inrecordmusic.com）課程訂單 webhook：
// 付款成功 → 進 InRecord 付款名單（source=concert）→ 後台手動寄信/開通。
// 與 WooCommerce webhook 共用 handleWoocommerceWebhook 核心邏輯，僅 secret/productMap/source 不同。
import { getSupabaseAdmin } from "@/lib/supabase";
import { parseCourseProductMap } from "@/lib/woocommerce";
import { handleWoocommerceWebhook } from "@/lib/woocommerce-webhook";

export const runtime = "nodejs"; // 需 node crypto 與原始 body 驗 HMAC

export async function POST(req) {
  const rawBody = await req.text();
  const { status, body } = await handleWoocommerceWebhook({
    rawBody,
    signature: req.headers.get("x-wc-webhook-signature"),
    secret: process.env.CONCERT_WEBHOOK_SECRET,
    productMap: parseCourseProductMap(process.env.CONCERT_COURSE_PRODUCT_IDS),
    supabase: getSupabaseAdmin(),
    source: "concert",
  });
  return new Response(body, { status });
}
