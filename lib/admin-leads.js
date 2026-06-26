// lib/admin-leads.js — 後台「付款名單」共用查詢（依賴注入 supabase，可測）。
// 付款名單由兩個外部站台的 webhook 寫入：
//   - WooCommerce(碩樂現場) → source:"wordpress"
//   - concert-shop          → source:"concert"
// 後台「開通課程」「寄預購信」「名單面板」都必須同時涵蓋這兩個來源，否則 concert 訂單
// 進了 DB 卻在後台看不到、開不了通、寄不了信（顧客付了錢拿不到課）。
export const LEAD_SOURCES = ["wordpress", "concert"];

// 撈付款名單中「尚未處理」的訂單。
// flagColumn：去重旗標欄位（開通 = access_granted_at；寄預購信 = presale_email_sent_at）。
// ids：可選，只撈指定訂單。回傳 supabase 查詢結果 { data, error }。
export function fetchPendingLeads(supabase, { columns, flagColumn, ids } = {}) {
  let query = supabase
    .from("orders")
    .select(columns)
    .in("source", LEAD_SOURCES)
    .is(flagColumn, null);
  if (Array.isArray(ids) && ids.length) query = query.in("id", ids);
  return query;
}
