// lib/payuni-expire.js — PAYUNi 整合式支付頁的 ATM／超商繳費期限（純函式可測）
//
// 背景：ATM 虛擬帳號一經取號就有效到繳費期限（PAYUNi 預設當日 +7 天），取號後無法取消或縮短。
// 優惠價截止前取號、截止後才轉帳，就能用已結束的價格付款（2026-09-21 真的發生過一筆）。
// 解法：結帳時帶 ExpireDate，讓帳號跟這筆價格同一天失效。PAYUNi 規定期限設當日時，
// 訂單成立後至少要留 2 小時繳費，不足就只能設隔日（帳號活過截止）→ 改成只開即時付款方式。
const DAY = 86_400_000;
// PAYUNi 的 2 小時是從「訂單成立（取號）」算，我們是在結帳當下量；多留 15 分鐘給買家在支付頁停留、選付款方式
export const MIN_TRANSFER_WINDOW_MS = 2 * 3_600_000 + 15 * 60_000;
// 最後階段只開的付款方式。PAYUNi：一旦帶了任何支付工具旗標，沒帶的就不顯示；這兩種是正式站實際用過的即時付款
//（PaymentType 1＝信用卡、7＝AFTEE 後支付），ATM／超商不在內。
export const INSTANT_ONLY = Object.freeze({ Credit: "1", Aftee: "1" });

// 台灣日期 YYYY-MM-DD（PAYUNi ExpireDate 格式）
const twDate = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
const twDayStart = (day) => Date.parse(`${day}T00:00:00+08:00`);
const twDayEnd = (day) => Date.parse(`${day}T23:59:59.999+08:00`);

// coupons.ends_at 是 DATE（後台填的台灣日期）→ 當日 23:59:59.999 台灣時間；其他格式交給 Date.parse
export function couponEndsAtMs(endsAt) {
  if (!endsAt) return NaN;
  const s = String(endsAt);
  return Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T23:59:59.999+08:00` : s);
}

// deadlines：這筆價格的各種截止時間（毫秒）。inclusive（粉絲 23:59）或 exclusive（波段隔日 00:00）皆可。
// 回傳要併進 upp 參數的欄位：{}（用 PAYUNi 預設）| { ExpireDate } | { Credit, Aftee }（只開即時付款）
export function atmExpireParams({ deadlines = [], now = new Date(), maxDays = 7 } = {}) {
  const deadline = Math.min(...deadlines.filter(Number.isFinite));
  if (!Number.isFinite(deadline)) return {};
  const t = now.getTime();
  let day = twDate(deadline - 1);
  // ExpireDate 只到「日」（帳號活到該日 23:59）。截止若不在日界（台灣 23:59 之前就結束，
  // 例如後台把波段迄設成 20:00），只能保證到前一天，否則截止到當天午夜之間仍可用舊價轉帳。
  if (deadline < Date.parse(`${day}T23:59:00+08:00`)) day = twDate(twDayStart(day) - 1);
  // 到期日的結尾離現在不足最短繳費時間（含期限已過）→ 不給 ATM／超商
  if (twDayEnd(day) - t < MIN_TRANSFER_WINDOW_MS) return { ...INSTANT_ONLY };
  // 到期日不早於 PAYUNi 預設（+7 天）就不必帶；帶超過 +7 天反而會讓支付頁藏起超商代碼
  if (day >= twDate(t + maxDays * DAY)) return {};
  return { ExpireDate: day };
}
