// api/stripe/checkout.js
// Stripe Checkout Session API — Vercel Serverless
//
// 環境變數設定（在 Vercel Dashboard > Settings > Environment Variables）：
//   STRIPE_SECRET_KEY     = sk_live_xxx   （或 sk_test_xxx 測試用）
//   STRIPE_SUCCESS_URL    = https://your-domain.com/success   （付款成功跳轉頁）
//   STRIPE_CANCEL_URL     = https://your-domain.com/#pricing  （取消後跳轉頁）
//
// 每個方案需在 Stripe Dashboard 建立 Price ID，填入下方 PRICE_MAP。
// 建立方式：Stripe > Products > Add Product > 輸入名稱與金額 > 複製 price_xxx ID

const PRICE_MAP = {
  fan1:   process.env.STRIPE_PRICE_FAN1   || "",  // 粉絲限定【1】$2,200
  fan2:   process.env.STRIPE_PRICE_FAN2   || "",  // 粉絲限定【2】$2,400
  early1: process.env.STRIPE_PRICE_EARLY1 || "",  // 第一波早鳥   $2,800
  early2: process.env.STRIPE_PRICE_EARLY2 || "",  // 第二波早鳥   $3,100
  early3: process.env.STRIPE_PRICE_EARLY3 || "",  // 第三波早鳥   $3,300
  full:   process.env.STRIPE_PRICE_FULL   || "",  // 原價         $3,500
};

const PLAN_NAMES = {
  fan1:   "粉絲限定【1】— 零基礎流行鋼琴入門課",
  fan2:   "粉絲限定【2】— 零基礎流行鋼琴入門課",
  early1: "第一波｜早鳥【1】— 零基礎流行鋼琴入門課",
  early2: "第二波｜早鳥【2】— 零基礎流行鋼琴入門課",
  early3: "第三波｜最後早鳥【3】— 零基礎流行鋼琴入門課",
  full:   "原價｜零基礎流行鋼琴入門課",
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const { planId } = req.body || {};

  if (!planId || !PRICE_MAP[planId]) {
    return res.status(400).json({ error: "invalid_plan_id", received: planId });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({
      error: "missing_STRIPE_SECRET_KEY",
      hint: "請到 Vercel Dashboard > Settings > Environment Variables 加入 STRIPE_SECRET_KEY"
    });
  }

  const priceId = PRICE_MAP[planId];
  if (!priceId) {
    return res.status(500).json({
      error: "missing_price_id",
      plan: planId,
      hint: `請設定環境變數 STRIPE_PRICE_${planId.toUpperCase()}`
    });
  }

  try {
    const stripe = (await import("stripe")).default(process.env.STRIPE_SECRET_KEY);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      metadata: {
        plan_id: planId,
        plan_name: PLAN_NAMES[planId] || planId,
        source: "inrecord_course_landing",
      },
      success_url: (process.env.STRIPE_SUCCESS_URL || `${req.headers.origin}/success`) + "?session_id={CHECKOUT_SESSION_ID}",
      cancel_url:  process.env.STRIPE_CANCEL_URL  || `${req.headers.origin}/#pricing`,
      locale: "zh",
      // 允許優惠碼輸入（可選）
      // allow_promotion_codes: true,
      payment_method_types: ["card"],
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error("[stripe checkout error]", error.message);
    return res.status(500).json({
      error: "stripe_session_failed",
      message: error.message,
    });
  }
}
