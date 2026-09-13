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

// 未讀＝逐則判定：有已讀清單（read）就看這則在不在清單裡。
// read 為 null＝這台裝置還沒遷移過，退回舊規則（建立時間晚於最後看過的時間 seenAt）。
export function isUnread(a, state) {
  const read = state?.read;
  if (Array.isArray(read)) return !read.includes(a?.id);
  const seenAt = state?.seenAt;
  return !seenAt || ts(a?.created_at) > ts(seenAt);
}

export function countUnread(sorted, state) {
  return (sorted || []).filter((a) => isUnread(a, state)).length;
}

// 舊資料遷移（每台裝置一次）：seenAt 之前建立的公告一次記成已讀，
// 否則老學員升級後會突然看到一整排「未讀」。沒有 seenAt（新裝置）→ 空清單，全部未讀。
export function legacyReadIds(sorted, seenAt) {
  if (!seenAt) return [];
  return (sorted || []).filter((a) => ts(a?.created_at) <= ts(seenAt)).map((a) => a.id);
}

// 進教室要先彈出的那則：第一則 important 且尚未按「知道了」（ackedIds）。
export function pickImportant(sorted, ackedIds) {
  const acked = new Set(ackedIds || []);
  return (sorted || []).find((a) => a.important && !acked.has(a.id)) || null;
}

// 播放頁提示條：最新的一則未讀（不看置頂）；使用者關過就不顯示。
// 播放頁頁首的橫幅：一律顯示「最新的一則」，不限未讀 —— 學員讀過之後仍看得到最新公告在哪，
// 只是轉成安靜的樣式（未讀才強調）。按 × 關掉該則後就不再出現。
export function pickStrip(sorted, state, dismissedId) {
  const top = (sorted || []).slice().sort((a, b) => ts(b.created_at) - ts(a.created_at))[0];
  if (!top || top.id === dismissedId) return null;
  return { ...top, unread: isUnread(top, state) };
}
