// lib/notes-format.js — 筆記時間格式與排序純邏輯。

export function formatSeconds(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

export function sortNotes(list) {
  return (list || []).slice().sort((a, b) => (a.seconds || 0) - (b.seconds || 0));
}
