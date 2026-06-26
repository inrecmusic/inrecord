// lib/woocommerce.js — WooCommerce webhook 純函式（可測）：簽章驗證、商品對應、訂單擷取
import crypto from "crypto";

// WooCommerce 付款後狀態：processing（已收款待出貨，混合周邊訂單常停這）/ completed（完成）
const PAID_STATUSES = new Set(["processing", "completed"]);

// 驗 WooCommerce webhook 簽章：base64( HMAC-SHA256( 原始body, secret ) )，timing-safe 比對。
// 缺簽章或缺 secret 一律回 false（不可在缺金鑰時放行）。
export function verifyWooSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  let expected;
  try {
    expected = crypto.createHmac("sha256", secret).update(rawBody ?? "", "utf8").digest("base64");
  } catch {
    return false;
  }
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(signature), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// 解析 WOOCOMMERCE_COURSE_PRODUCT_IDS：格式 "1234:bundle" 或逗號分隔 "1234:bundle,5678:course"。
// 回 { [productId(字串)]: plan }；格式錯誤項（缺 id 或缺 plan）忽略。
export function parseCourseProductMap(env) {
  const out = {};
  if (!env || typeof env !== "string") return out;
  for (const part of env.split(",")) {
    const [idRaw, planRaw] = part.split(":");
    const id = (idRaw || "").trim();
    const plan = (planRaw || "").trim();
    if (id && plan) out[id] = plan;
  }
  return out;
}

// 從 WooCommerce 訂單擷取「課程那一項」。非付款狀態/無課程商品/缺 email/測試 ping → 回 null。
// 周邊商品自動忽略；金額取課程項 total（非整張訂單總額）。
// prefix 區隔來源：WooCommerce(碩樂)=WC、concert-shop=CC，避免不同站台同一訂單號產生相同
// mer_trade_no（UNIQUE）而被 webhook 的 ignoreDuplicates 靜默吞掉後到的那筆。
export function extractCourseOrder(order, productMap, prefix = "WC") {
  if (!order || !Array.isArray(order.line_items)) return null;
  if (!PAID_STATUSES.has(order.status)) return null;
  const email = (order.billing?.email || "").trim().toLowerCase();
  if (!email) return null;
  const item = order.line_items.find((li) => productMap[String(li.product_id)]);
  if (!item) return null;
  const plan = productMap[String(item.product_id)];
  const planLabel = (item.name || "").trim() || plan;
  const amount = Math.round(Number(item.total) || 0);
  const phone = (order.billing?.phone || "").trim();
  return { email, plan, planLabel, amount, merTradeNo: `${prefix}${order.id}`, phone };
}
