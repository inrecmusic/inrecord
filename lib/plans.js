// 方案價格與品名（後端權威來源，前端不可信任）
// AI 練功房（game）單買方案已於 2026-06 下架；僅保留 course 與 bundle。
// 既有 game 訂閱仍有效（notify 依 order.plan 開通、不依賴此表），bundle 仍含 AI 遊戲。
export const PLAN_CATALOG = {
  course: { price: 3800, label: "鋼琴自學全課程" },
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

// 優惠券合法 type；非法值（含 undefined）回退 'percent'
export const COUPON_TYPES = ["percent", "fixed", "price"];
export function normalizeCouponType(type) {
  return COUPON_TYPES.includes(type) ? type : "percent";
}

// 僅允許 PLAN_CATALOG 既有方案鍵；其餘（含 null/空字串/繼承屬性）→ null（不限方案）
export function normalizeCouponPlan(plan) {
  return Object.keys(PLAN_CATALOG).includes(plan) ? plan : null;
}

// 驗證 type/value 組合；通過回 null，否則回錯誤碼（admin 寫入共用，POST/PATCH 一致）
export function couponValueError(type, value) {
  if (!Number.isFinite(value) || value <= 0) return "invalid_value";
  if (type === "percent" && value > 100) return "percent_over_100";
  return null;
}
