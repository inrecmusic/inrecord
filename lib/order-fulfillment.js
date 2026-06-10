// 訂單履約去重決策（付款成功後 notify 處理用的純函式，便於測試）
//
// 設計重點：一次性履約（優惠券累計＋寄開課信）與「可重試的開發票」用不同旗標，
// 避免開票反覆失敗時，每次重送 notify 都重複累計優惠券／重複寄信。

// 是否需要執行一次性履約（優惠券 +1、寄開課信）：以 fulfilled_at 為去重旗標
export function needsFulfillment(order) {
  return !!order?.id && !order.fulfilled_at;
}

// 是否需要（重新）開立發票：以 invoice_no 為去重旗標，開票失敗時可隨後重試
export function needsInvoice(order) {
  return !!order?.id && !order.invoice_no;
}
