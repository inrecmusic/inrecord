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

// 是否自動開立發票（fail-safe 預設關閉）。
// 目前發票由人員依 PAYUNi 訂單記錄人工開立（尚未申請電子發票票匭），故付款成功後不自動打 Amego，
// 避免開出測試假發票／與人工重複開立。待 Amego 切正式環境＋申請到票匭後，設 AUTO_INVOICE=on 即恢復自動開票。
export function autoInvoiceEnabled(env = process.env) {
  return env?.AUTO_INVOICE === "on";
}
