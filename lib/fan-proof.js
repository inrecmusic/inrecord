// 粉絲限定憑證折價：純邏輯（無 I/O，可單元測試）。
export const FAN_PRICE = 3499;          // 粉絲價（成交價，type='price'）
export const FAN_PLAN = "bundle";       // 僅課程包適用
// 申請截止：2026-09-03 23:59:59（台灣 UTC+8）
export const FAN_PROOF_DEADLINE = Date.parse("2026-09-03T23:59:59+08:00");

export function isFanProofOpen(now = new Date()) {
  return now.getTime() <= FAN_PROOF_DEADLINE;
}

// 一次性粉絲定價券（套用既有 coupons / applyCoupon 系統）。
export function buildFanCoupon({ code, now = new Date() }) {
  return {
    name: "粉絲憑證折價",
    code,
    type: "price",
    value: FAN_PRICE,
    plan: FAN_PLAN,
    usage_limit: 1,
    status: "active",
    starts_at: null,
    ends_at: null,
  };
}
