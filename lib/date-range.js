// lib/date-range.js — 後台日期區間篩選的純判斷。
// dateValue 應傳「原始時間」（ISO / timestamptz），不要傳已在地化的顯示字串
// （toLocaleString 產出的 "2026/6/26 上午10:30" 會被 new Date() 解析成 Invalid Date）。
// from / to 為 'YYYY-MM-DD'（後台日期選擇器）或空字串：一律當「台灣時間」的當日 00:00:00 ～ 23:59:59.999 解讀。
// ⚠️ 不能用 new Date('YYYY-MM-DD')：規格上純日期字串是 UTC 00:00（＝台灣 08:00），
//   台灣 00:00～07:59 成立的訂單會在起始日當天篩不到；迄日側原本用 setHours 又依瀏覽器時區，兩邊不一致。
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TW = "+08:00";
const dayStart = (s) => (DAY_RE.test(s) ? new Date(`${s}T00:00:00${TW}`) : new Date(s));
function dayEnd(s) {
  if (DAY_RE.test(s)) return new Date(`${s}T23:59:59.999${TW}`);
  const t = new Date(s);
  t.setHours(23, 59, 59, 999);
  return t;
}
export function inDateRange(dateValue, from, to) {
  if (!from && !to) return true;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return false;
  if (from && d < dayStart(from)) return false;
  if (to && d > dayEnd(to)) return false;
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
