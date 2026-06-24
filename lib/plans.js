// 方案價格與品名（後端權威來源，前端不可信任）
// 2026-06：course 單賣下架（sellable:false → checkout 拒收新單賣），全站只賣 bundle 課程包。
// course 仍保留於此表，供既有訂單與 WooCommerce 現場購買履約（fulfillment-grant 依 order.plan
// 開通，不看 sellable）；既有 game 訂閱亦仍有效。
export const PLAN_CATALOG = {
  course: { price: 3800, label: "鋼琴自學全課程", sellable: false },
  bundle: { price: 3999, label: "學琴全攻略" },
};

// 套用優惠券計算折後價（不會低於 0）
export function applyCoupon(price, coupon) {
  if (!coupon) return price;
  if (coupon.type === "price") return Math.max(0, Math.min(coupon.value, price));
  const final = coupon.type === "percent"
    ? Math.round(price * (1 - coupon.value / 100))
    : price - coupon.value;
  return Math.max(0, final);
}

// 驗證優惠券；通過回傳 null，否則回傳錯誤代碼
export function couponError(coupon, now = new Date()) {
  if (!coupon) return "coupon_not_found";
  if (coupon.status !== "active") return "coupon_inactive";
  if (coupon.starts_at && new Date(coupon.starts_at) > now) return "coupon_not_started";
  if (coupon.ends_at) {
    const end = new Date(coupon.ends_at);
    end.setHours(23, 59, 59, 999);
    if (end < now) return "coupon_expired";
  }
  if (coupon.usage_limit != null && coupon.used >= coupon.usage_limit) return "coupon_used_up";
  return null;
}

// 方案鎖：coupon.plan 有值且與結帳方案不符 → 錯誤碼（couponError 保持不變）
export function couponPlanError(coupon, plan) {
  if (coupon && coupon.plan && plan && coupon.plan !== plan) return "coupon_wrong_plan";
  return null;
}
