// lib/lead-cleanup.js — 潛客名單清理：找出「Brevo 潛客名單裡已經買過課」的信箱。
//
// 購買當下自動退出名單的機制（notify／webhook／後台手動開通）是 2026-09 才補齊的，
// 在那之前就買課、又曾留過信箱的人仍留在名單裡，會收到「還在考慮嗎」這類信。
// 這支負責一次性（或日後隨時）比對並清掉。
import { normalizeEmail } from "./unsubscribe.js";
import { selectAll } from "./supabase-paginate.js";

// 買過課的信箱＝已付款訂單（含指定開通信箱）∪ 已開通紀錄，與電子報「已付款」對象同一套規則。
//
// ⚠️ 刻意不重用 lib/newsletter-send 的 gatherAudienceEmails("buyers")：那邊會再排除退訂名單，
// 用在這裡會讓「買了課又退訂電子報」的人被當成沒買過而留在潛客名單裡，正好與本功能的目的相反。
export async function fetchBuyerEmails(supabase) {
  const [orders, enrollments] = await Promise.all([
    selectAll(supabase, "orders", (q) => q.select("email, grant_email").eq("status", "paid")),
    selectAll(supabase, "enrollments", (q) => q.select("email")),
  ]);
  const out = new Set();
  for (const o of orders) {
    for (const e of [o.email, o.grant_email]) {
      const n = normalizeEmail(e);
      if (n) out.add(n);
    }
  }
  for (const e of enrollments) {
    const n = normalizeEmail(e.email);
    if (n) out.add(n);
  }
  return out;
}

// 純函式：回傳潛客名單中已購買者的信箱（正規化、去重，維持名單原本的順序）。
export function matchBoughtLeads(leadEmails, buyerEmailSet) {
  const seen = new Set();
  const out = [];
  for (const raw of leadEmails || []) {
    const e = normalizeEmail(raw);
    if (!e || seen.has(e) || !buyerEmailSet.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}
