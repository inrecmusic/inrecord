// 後台統計用的訂單過濾純函式。
//
// 兩種單不是真實成交，統計一律排除：
//   1) 手動開通單（source='manual'：status='paid'、amount 0）
//   2) 測試付款：已付款但金額低於 TEST_PAYMENT_MAX（正式售價最低也是數千元，NT$1 這種是串金流的測試單）
// 儀表板「本月訂單」與訂單管理「已付款訂單」兩張卡不計入筆數（其餘統計與列表不受影響）。
export const TEST_PAYMENT_MAX = 100;

const norm = (e) => String(e || "").trim().toLowerCase();

// 測試付款：金額是數字且低於門檻，而且不是「待付款／失敗」（那些單金額本來就是正常售價，不會是測試）。
function isTestPayment(o) {
  if (o?.amount == null || o.amount === "") return false; // 沒帶金額欄位（舊資料／只撈部分欄位）不判斷
  const amount = Number(o.amount);
  if (!Number.isFinite(amount) || amount >= TEST_PAYMENT_MAX) return false;
  return o.status === undefined || o.status === "paid";
}

// 不計入營收／購買人數的單：手動開通單＋測試付款。
export function isNonRevenueOrder(o) {
  return o?.source === "manual" || isTestPayment(o);
}

export function excludeManual(orders = []) {
  return orders.filter((o) => !isNonRevenueOrder(o));
}

// 側欄「訂單管理」徽章：已付款訂單數（不含手動開通與測試付款），與訂單頁「已付款訂單」卡同一個數字。
export function paidOrderCount(orders = []) {
  return excludeManual(orders).filter((o) => o.status === "paid").length;
}

// 「後來已經付款成功」的未完成單：同一個買家（下單信箱，或付款成功頁指定的開通信箱 grant_email）
// 在這筆單建立之後（含同時）有一筆真實的已付款訂單 → 這筆 pending／failed 是被取代的舊單，
// 不該再當成「待處理」，也不該寄「訂單未完成」提醒（買家第一次付款失敗、重新下單付成功是常態）。
// 回傳這些單的 id 集合。orders 要同時包含未完成單與已付款單（沒有已付款單就沒有任何單被取代）。
export function supersededPendingIds(orders = []) {
  const latestPaidAt = new Map(); // email → 最近一筆真實已付款訂單的時間
  for (const o of orders) {
    if (o?.status !== "paid" || isNonRevenueOrder(o)) continue;
    const t = new Date(o.created_at || o.createdRaw || 0).getTime();
    if (!Number.isFinite(t)) continue;
    for (const e of [norm(o.email), norm(o.grant_email)]) {
      if (e && t > (latestPaidAt.get(e) ?? -Infinity)) latestPaidAt.set(e, t);
    }
  }
  const out = new Set();
  for (const o of orders) {
    if (o?.status !== "pending" && o?.status !== "failed") continue;
    const e = norm(o.email);
    const paidAt = e ? latestPaidAt.get(e) : undefined;
    const t = new Date(o.created_at || o.createdRaw || 0).getTime();
    if (paidAt !== undefined && Number.isFinite(t) && paidAt >= t) out.add(o.id);
  }
  return out;
}

// 已有真實付款的信箱集合（下單信箱＋開通信箱）。批次追單用：只要這個人付過款，就不再寄追單信。
export function paidEmailSet(orders = []) {
  const s = new Set();
  for (const o of orders) {
    if (o?.status !== "paid" || isNonRevenueOrder(o)) continue;
    for (const e of [norm(o.email), norm(o.grant_email)]) if (e) s.add(e);
  }
  return s;
}
