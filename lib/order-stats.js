// 後台統計用的訂單過濾純函式。
// 手動開通單（source='manual'：status='paid'、amount 0）不是真實成交，
// 儀表板「本月訂單」與訂單管理「已付款訂單」兩張卡不計入筆數（其餘統計與列表不受影響）。
export function excludeManual(orders = []) {
  return orders.filter((o) => o?.source !== "manual");
}

// 側欄「訂單管理」徽章：已付款訂單數（不含手動開通），與訂單頁「已付款訂單」卡同一個數字。
export function paidOrderCount(orders = []) {
  return excludeManual(orders).filter((o) => o.status === "paid").length;
}
