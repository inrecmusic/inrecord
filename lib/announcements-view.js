// lib/announcements-view.js — 公告排序與挑選純邏輯（儀表板／播放頁共用）。
// 規則：只留 published；pinned 在前；其餘依 created_at 新→舊。
// 時間一律用 Date.parse 比（Supabase 回 +00:00、瀏覽器存 Z，字串比較會出錯）。

const ts = (v) => { const t = Date.parse(v); return Number.isFinite(t) ? t : 0; };

export function sortAnnouncements(list) {
  const published = (list || []).filter((a) => a && a.published);
  return published.slice().sort((a, b) => {
    const ap = a.pinned ? 1 : 0;
    const bp = b.pinned ? 1 : 0;
    if (ap !== bp) return bp - ap; // pinned 在前
    return ts(b.created_at) - ts(a.created_at); // 新→舊
  });
}

// 未讀＝建立時間晚於「最後看過的時間」；沒看過就全部未讀。
export function isUnread(a, seenAt) {
  return !seenAt || ts(a?.created_at) > ts(seenAt);
}

export function countUnread(sorted, seenAt) {
  return (sorted || []).filter((a) => isUnread(a, seenAt)).length;
}

// 進教室要先彈出的那則：第一則 important 且尚未按「知道了」（ackedIds）。
export function pickImportant(sorted, ackedIds) {
  const acked = new Set(ackedIds || []);
  return (sorted || []).find((a) => a.important && !acked.has(a.id)) || null;
}

// 播放頁提示條：最新的一則未讀（不看置頂）；使用者關過就不顯示。
export function pickStrip(sorted, seenAt, dismissedId) {
  const top = (sorted || [])
    .filter((a) => isUnread(a, seenAt))
    .sort((a, b) => ts(b.created_at) - ts(a.created_at))[0];
  return top && top.id !== dismissedId ? top : null;
}
