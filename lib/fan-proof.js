// 粉絲限定憑證折價：純邏輯（無 I/O，可單元測試）。
export const FAN_PRICE = 3499;          // 粉絲價（成交價，type='price'）
export const FAN_PLAN = "bundle";       // 僅課程包適用
// 申請截止：2026-09-03 23:59:59（台灣 UTC+8）
export const FAN_PROOF_DEADLINE = Date.parse("2026-09-03T23:59:59+08:00");

export function isFanProofOpen(now = new Date()) {
  return now.getTime() <= FAN_PROOF_DEADLINE;
}

// 僅接受「我們自己的」Supabase Storage proof-uploads 公開 URL。
// 擋掉任意外部 https 主機——否則攻擊者可在 checkout 塞入 https://evil.com/x.png，
// 該單會進後台「粉絲待審核」，管理員瀏覽時瀏覽器即向攻擊者主機發出請求
// （admin-side SSRF / 釣魚 / 追蹤像素），並可灌爆審核佇列。
export function isOwnProofUrl(proofUrl, supabaseUrl) {
  if (typeof proofUrl !== "string" || proofUrl.length === 0 || proofUrl.length > 2048) return false;
  if (typeof supabaseUrl !== "string" || !supabaseUrl) return false;
  let u, base;
  try { u = new URL(proofUrl); base = new URL(supabaseUrl); } catch { return false; }
  return u.protocol === "https:" &&
         u.hostname === base.hostname &&
         u.pathname.startsWith("/storage/v1/object/public/proof-uploads/");
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
