// lib/preview-leads.js — course_preview_leads（demo 漏斗名單）後台 PATCH 的 patch 組裝。
// 只在有帶 status 時才寫入 status，避免「沒帶 status 的局部更新」把欄位覆寫成 null。
export function buildLeadPatch(body, now = new Date()) {
  const { id, status, ...rest } = body || {};
  const patch = { ...rest, updated_at: now.toISOString() };
  if (status !== undefined) patch.status = status;
  if (status === "demo_opened") {
    patch.demo_opened = true;
    patch.demo_opened_at = patch.demo_opened_at || now.toISOString();
  }
  if (status === "purchased") {
    patch.purchased = true;
    patch.purchased_at = patch.purchased_at || now.toISOString();
  }
  return patch;
}
