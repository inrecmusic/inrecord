// lib/date-range.js — 後台日期區間篩選的純判斷。
// dateValue 應傳「原始時間」（ISO / timestamptz），不要傳已在地化的顯示字串
// （toLocaleString 產出的 "2026/6/26 上午10:30" 會被 new Date() 解析成 Invalid Date）。
// from / to 為 'YYYY-MM-DD' 或空字串；to 含當日整天（到 23:59:59.999，依執行環境時區）。
export function inDateRange(dateValue, from, to) {
  if (!from && !to) return true;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return false;
  if (from && d < new Date(from)) return false;
  if (to) {
    const t = new Date(to);
    t.setHours(23, 59, 59, 999);
    if (d > t) return false;
  }
  return true;
}

// 驗證起訖日（優惠券 / 序號批次用）。空值視為未設、合法。
// 回 { ok:true } 或 { ok:false, error }。
export function validateDateRange(starts_at, ends_at) {
  const hasStart = starts_at != null && starts_at !== "";
  const hasEnd = ends_at != null && ends_at !== "";
  if (hasStart && Number.isNaN(Date.parse(starts_at))) return { ok: false, error: "invalid_starts_at" };
  if (hasEnd && Number.isNaN(Date.parse(ends_at))) return { ok: false, error: "invalid_ends_at" };
  if (hasStart && hasEnd && Date.parse(starts_at) > Date.parse(ends_at))
    return { ok: false, error: "starts_after_ends" };
  return { ok: true };
}
