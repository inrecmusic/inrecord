// lib/duration.js — 後台 videos.duration（顯示用 TEXT，例 "12:40"）→ 秒數。
// 進度完成判定要有「伺服器端知道的影片長度」才不會被前端送來的假 total_seconds 騙；
// 這個欄位後台新增單元時就會填，不必再加欄位或呼叫 Bunny API。
// 解析不出來回 0，呼叫端據此退回原本採用前端值的行為。
export function parseDurationSeconds(text) {
  if (typeof text !== "string") return 0;
  const s = text.trim().replace(/：/g, ":");
  if (!/^\d+(:\d{1,2}){0,2}$/.test(s)) return 0;
  const parts = s.split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length > 1 && parts.slice(1).some((n) => n > 59)) return 0;
  const total = parts.reduce((acc, n) => acc * 60 + n, 0);
  return total > 0 ? total : 0;
}
