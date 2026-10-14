// lib/rating-edit.js — 學員修改自己那筆評價的規則（純函式，API 與前端共用）。
// 點星就先存，所以要留修正空間：送出後 15 分鐘內星數與心得都可改；
// 之後鎖定，唯一例外是「心得還空白」的人隨時可以補寫。
// 任何實際變動都把 featured 設回 false——首頁精選是後台看過內容才勾的，內容變了就得重新勾。
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

function withinWindow(existing, nowMs) {
  const t = Date.parse(existing?.created_at || "");
  return Number.isFinite(t) && nowMs - t <= EDIT_WINDOW_MS;
}

export function canEditScore(existing, nowMs = Date.now()) {
  return withinWindow(existing, nowMs);
}

// 回 { error } 或 { patch }；patch 為 null 表示沒有任何變動。
export function planRatingEdit(existing, input = {}, nowMs = Date.now()) {
  const open = withinWindow(existing, nowMs);
  const patch = {};

  if (input.score !== undefined) {
    const s = input.score;
    if (!Number.isInteger(s) || s < 1 || s > 5) return { error: "invalid_score" };
    if (s !== existing.score) {
      if (!open) return { error: "edit_window_closed" };
      patch.score = s;
    }
  }

  if (input.content !== undefined) {
    const next = (typeof input.content === "string" ? input.content.trim() : "") || null;
    if (next && next.length > 1000) return { error: "content_too_long" };
    const prev = existing.content?.trim() || null;
    if (next !== prev) {
      if (prev && !open) return { error: "edit_window_closed" };
      patch.content = next;
    }
  }

  if (!Object.keys(patch).length) return { patch: null };
  return { patch: { ...patch, featured: false } };
}
