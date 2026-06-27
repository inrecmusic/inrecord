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
// grant（建立課程存取）/ sendEmail（寄通知信）皆預設 true（僅明確 false 才關）；
// 兩者皆 false → 沒事可做；空電話/姓名 → null。
export function normalizeManualGrantInput(input = {}) {
  const email = String(input.email ?? "").trim().toLowerCase();
  if (!email) return { ok: false, error: "missing_email" };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "invalid_email" };

  const plan = VALID_PLANS.includes(input.plan) ? input.plan : "bundle";
  const phone = input.phone != null ? String(input.phone).trim() : "";
  const name = input.name != null ? String(input.name).trim() : "";
  const grant = input.grant !== false;
  const sendEmail = input.sendEmail !== false;
  if (!grant && !sendEmail) return { ok: false, error: "nothing_to_do" };

  return { ok: true, value: { email, plan, phone: phone || null, name: name || null, grant, sendEmail } };
}

// 組 orders insert payload。now 由呼叫端傳入（純函式不呼 Date.now，方便測試）。
// granted=true（開通）→ status='paid'、access_granted_at=now（計入學員、算真實開通）。
// granted=false（只寄信的紀錄單）→ status='notified'、access_granted_at=null —— 純粹留痕
//   讓寄信結果可事後查證（不開通、不計營收：source='manual' 本就排除於對帳）。
export function buildManualOrder({ email, plan, phone = null, name = null, now, granted = true }) {
  const ts = now instanceof Date ? now : new Date(now);
  return {
    email,
    plan,
    plan_label: PLAN_LABELS[plan] || PLAN_LABELS.bundle,
    amount: 0,
    status: granted ? "paid" : "notified",
    source: "manual",
    buyer_name: name || null,
    phone: phone || null,
    payment_method: "manual",
    mer_trade_no: (granted ? "MANUAL-" : "MAILONLY-") + ts.getTime(),
    access_granted_at: granted ? ts.toISOString() : null,
  };
}
