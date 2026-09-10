// lib/admin-leads.js — 後台「付款名單」共用查詢（依賴注入 supabase，可測）。
// 付款名單由兩個外部站台的 webhook 寫入：
//   - WooCommerce(碩樂現場) → source:"wordpress"
//   - concert-shop          → source:"concert"
// 後台「開通課程」「寄預購信」「名單面板」都必須同時涵蓋這兩個來源，否則 concert 訂單
// 進了 DB 卻在後台看不到、開不了通、寄不了信（顧客付了錢拿不到課）。
import { selectAll } from "./supabase-paginate.js";

export const LEAD_SOURCES = ["wordpress", "concert"];

// 撈付款名單中「尚未處理」的訂單。
// flagColumn：去重旗標欄位（開通 = access_granted_at；寄預購信 = presale_email_sent_at）。
// ids：可選，只撈指定訂單。回傳 { data, error }（沿用呼叫端既有寫法）。
// 用 selectAll 分頁：名單破千時「全部開通」「寄預購信」會被 PostgREST 預設 1000 列上限靜默截斷，
// 只處理前 1000 筆且毫無提示（顧客付了錢拿不到課）。同 grant-orders 的做法。
export async function fetchPendingLeads(supabase, { columns, flagColumn, ids } = {}) {
  try {
    const data = await selectAll(supabase, "orders", (q) => {
      const base = q.select(columns).in("source", LEAD_SOURCES).is(flagColumn, null);
      return Array.isArray(ids) && ids.length ? base.in("id", ids) : base;
    });
    return { data, error: null };
  } catch (e) {
    return { data: null, error: { message: e?.message || String(e) } };
  }
}
