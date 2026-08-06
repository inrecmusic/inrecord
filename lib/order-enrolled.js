// lib/order-enrolled.js — 用 enrollments 的 email 集合標記/篩選訂單開通狀態（純函式，可測）。
// 官網(payuni)訂單的 access_granted_at 永遠 NULL，開通權威是 enrollments 有無該 email。

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

// 每筆訂單加 enrolled 布林（email 在 enrolledEmails 集合內即已開通）。
export function markEnrolled(orders, enrolledEmails) {
  const set = new Set((enrolledEmails || []).map(norm));
  return (orders || []).map((o) => ({ ...o, enrolled: set.has(norm(o.email)) }));
}

// 篩出「要手動開通」的官網訂單：source=payuni + status=paid + plan∈{course,bundle}（此功能是開通「課程」，game 不寫 enrollments、本就不該進名單）+ 尚未開通。
export function pickUngrantedPayuni(orders, enrolledEmails) {
  const set = new Set((enrolledEmails || []).map(norm));
  return (orders || []).filter(
    (o) =>
      o.source === "payuni" &&
      o.status === "paid" &&
      (o.plan === "course" || o.plan === "bundle") &&
      !set.has(norm(o.email))
  );
}
