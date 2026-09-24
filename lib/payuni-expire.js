// lib/payuni-expire.js — PAYUNi 整合式支付頁的 ATM／超商繳費期限（純函式可測）
//
// 背景：ATM 虛擬帳號一經取號就有效到繳費期限（PAYUNi 預設當日 +7 天），取號後無法取消或縮短。
// 優惠價截止前取號、截止後才轉帳，就能用已結束的價格付款（2026-09-21 真的發生過一筆）。
// 解法：結帳時帶 ExpireDate，讓帳號跟這筆價格同一天失效。PAYUNi 規定期限設當日時，
// 訂單成立後至少要留 2 小時繳費，不足 2 小時只能設隔日（帳號就活過截止）→ 改成只開信用卡。
const DAY = 86_400_000;
export const MIN_TRANSFER_WINDOW_MS = 2 * 3_600_000;

// 台灣日期 YYYY-MM-DD（PAYUNi ExpireDate 格式）
const twDate = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });

// coupons.ends_at 是 DATE（後台填的台灣日期）→ 當日 23:59:59.999 台灣時間；其他格式交給 Date.parse
export function couponEndsAtMs(endsAt) {
  if (!endsAt) return NaN;
  const s = String(endsAt);
  return Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T23:59:59.999+08:00` : s);
}

// deadlines：這筆價格的各種截止時間（毫秒）。inclusive（粉絲 23:59）或 exclusive（波段 00:00）皆可，
// 一律減 1ms 取日期，兩種都會落在正確的最後一天。
// 回傳要併進 upp 參數的欄位：{}（用 PAYUNi 預設）| { ExpireDate } | { Credit: "1" }（只開信用卡）
export function atmExpireParams({ deadlines = [], now = new Date(), maxDays = 7 } = {}) {
  const deadline = Math.min(...deadlines.filter(Number.isFinite));
  if (!Number.isFinite(deadline)) return {};
  const t = now.getTime();
  if (deadline - t < MIN_TRANSFER_WINDOW_MS) return { Credit: "1" };
  const expireDate = twDate(deadline - 1);
  // 截止日不早於 PAYUNi 預設（+7 天）就不必帶；帶超過 +7 天反而會讓支付頁藏起超商代碼
  if (expireDate >= twDate(t + maxDays * DAY)) return {};
  return { ExpireDate: expireDate };
}
