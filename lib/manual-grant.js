// lib/manual-grant.js — 後台「手動開通課程」純邏輯（無 I/O，可測）。
// 提供：輸入正規化/驗證、組裝 orders insert payload。
// 實際開通(enrollments/subscriptions)沿用 lib/fulfillment-grant.js 的 grantAccess。

export const VALID_PLANS = ["bundle", "course"];

export const PLAN_LABELS = {
  bundle: "課程包（手動開通）",
  course: "課程（手動開通）",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 正規化/驗證後台輸入。email 必填且格式合法；plan 走白名單、預設 bundle；
// sendEmail 預設 true（僅明確 false 才不寄）；空電話/姓名 → null。
export function normalizeManualGrantInput(input = {}) {
  const email = String(input.email ?? "").trim().toLowerCase();
  if (!email) return { ok: false, error: "missing_email" };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "invalid_email" };

  const plan = VALID_PLANS.includes(input.plan) ? input.plan : "bundle";
  const phone = input.phone != null ? String(input.phone).trim() : "";
  const name = input.name != null ? String(input.name).trim() : "";
  const sendEmail = input.sendEmail !== false;

  return { ok: true, value: { email, plan, phone: phone || null, name: name || null, sendEmail } };
}

// 組 orders insert payload。now 由呼叫端傳入（純函式不呼 Date.now，方便測試）。
export function buildManualOrder({ email, plan, phone = null, name = null, now }) {
  const ts = now instanceof Date ? now : new Date(now);
  return {
    email,
    plan,
    plan_label: PLAN_LABELS[plan] || PLAN_LABELS.bundle,
    amount: 0,
    status: "paid",
    source: "manual",
    buyer_name: name || null,
    phone: phone || null,
    payment_method: "manual",
    mer_trade_no: "MANUAL-" + ts.getTime(),
    access_granted_at: ts.toISOString(),
  };
}
