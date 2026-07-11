// lib/announcements-view.js — 公告排序與橫幅挑選純邏輯。
// 規則：只留 published；pinned 在前；其餘依 created_at 字串新→舊。

export function sortAnnouncements(list) {
  const published = (list || []).filter((a) => a && a.published);
  return published.slice().sort((a, b) => {
    const ap = a.pinned ? 1 : 0;
    const bp = b.pinned ? 1 : 0;
    if (ap !== bp) return bp - ap; // pinned 在前
    return String(b.created_at || "").localeCompare(String(a.created_at || "")); // 新→舊
  });
}

// 取要當橫幅顯示的那一則：排序後第一則；若其 id 已被使用者關閉（dismissedId）或無資料 → null。
export function pickBanner(sorted, dismissedId) {
  const top = (sorted || [])[0];
  if (!top) return null;
  return top.id === dismissedId ? null : top;
}
