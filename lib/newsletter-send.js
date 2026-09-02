// lib/newsletter-send.js — 電子報名單擷取 + 逐封寄送編排（依賴注入 supabase / send，可測）。
import crypto from "crypto";
import { excludeUnsubscribed } from "./unsubscribe.js";
import { dedupeEmails } from "./newsletter.js";
import { selectAll } from "./supabase-paginate.js";

// 同一封電子報的內容指紋（subject + body）。用來在 newsletter_sends 去重，
// 讓「同一封內容」重跑/重按時跳過已寄對象，但「不同內容」視為新一封照常寄。
export function contentHash(subject, bodyMd) {
  return crypto.createHash("sha256").update(`${subject || ""}\n${bodyMd || ""}`).digest("hex");
}

// 從候選名單濾掉「這封內容」已寄過的 email（依 newsletter_sends 記錄）。
export async function filterUnsent(supabase, hash, emails) {
  if (!emails.length) return [];
  const { data, error } = await supabase
    .from("newsletter_sends").select("email").eq("content_hash", hash);
  if (error) throw new Error(error.message);
  const sent = new Set((data || []).map((r) => r.email));
  return emails.filter((e) => !sent.has(e));
}

// 今日（UTC 當日 00:00 起）實際已寄筆數 —— 作為真正的「每日上限」依據（跨多次呼叫累計）。
export async function countSentToday(supabase, now = new Date()) {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from("newsletter_sends")
    .select("id", { count: "exact", head: true })
    .gte("sent_at", start.toISOString());
  if (error) throw new Error(error.message);
  return count || 0;
}

// 併發防重寄的原子佔位：送「前」先 insert 佔位（而非送完才記錄）。
// insert 成功＝搶到這封（回 true，接著寄）；撞唯一鍵 23505＝別的請求已在處理這封
// （回 false，跳過不寄）。杜絕「群發進行中又被重按/刷新」時，把第二個請求尚未寄到的
// 名單整批重寄的問題。
export async function claimSend(supabase, hash, email) {
  const { error } = await supabase
    .from("newsletter_sends").insert({ content_hash: hash, email });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error(error.message);
}

// 寄送失敗 / 觸頂時退回佔位，讓該 email 下次重跑可再寄（維持「至少寄達一次」）。
export async function releaseSend(supabase, hash, email) {
  const { error } = await supabase
    .from("newsletter_sends").delete().eq("content_hash", hash).eq("email", email);
  if (error) throw new Error(error.message);
}

// 依對象撈出收件 email：
//   buyers     → enrollments.email（已開通課程者）
//   registered → Supabase Auth 使用者 email（分頁取完）
// 兩種對象最後都排除 newsletter_unsubscribes 內的 email（信中「取消訂閱」按鈕寫入）。
export async function gatherAudienceEmails(supabase, audience) {
  if (audience === "buyers") {
    // 「已付款優先」：已付款訂單 ∪ 已開通(enrollments)，取聯集後去重。
    // 只看 enrollments 會漏掉「付了錢但後台還沒開通」的人（開通是手動觸發，AUTO_GRANT_ACCESS 預設關）；
    // 只看 orders 會漏掉「手動開通但沒有訂單」的人。兩邊都收才不會有人收不到。
    // 訂單同時收 email 與 grant_email（購買信箱可能≠開課信箱），重複的由 dedupeEmails 收斂。
    // status='paid' 已排除 pending/expired/refunded；selectAll 分頁避免 >1000 筆被 PostgREST 靜默截斷。
    const [orders, enrollments] = await Promise.all([
      selectAll(supabase, "orders", (q) => q.select("email, grant_email").eq("status", "paid")),
      selectAll(supabase, "enrollments", (q) => q.select("email")),
    ]);
    const emails = [];
    for (const o of orders) { if (o.email) emails.push(o.email); if (o.grant_email) emails.push(o.grant_email); }
    for (const e of enrollments) if (e.email) emails.push(e.email);
    return excludeUnsubscribed(supabase, dedupeEmails(emails));
  }
  if (audience === "registered") {
    const emails = [];
    let page = 1;
    for (;;) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      const users = data?.users || [];
      if (users.length === 0) break;
      for (const u of users) emails.push(u.email);
      page++;
      if (page > 100) break; // 安全上限，避免異常無限迴圈
    }
    return excludeUnsubscribed(supabase, dedupeEmails(emails));
  }
  throw new Error("unknown_audience:" + audience);
}

// 逐封寄送。send(email) 回 { success, limitHit?, error? }。
// 遇 limitHit 立即停止（Brevo 觸頂）；dailyLimit 為本次可寄上限（已寄達標也停）。
// 併發防重寄：送「前」先 claim(email) 原子佔位，搶不到（別的請求已在處理這封）就跳過
// （skipped）；送失敗 / 觸頂則 release(email) 退回佔位，讓下次可重寄。claim 成功＝寄送記錄已落地。
export async function sendNewsletterBatch({ emails, send, dailyLimit, claim, release }) {
  const list = Array.isArray(emails) ? emails : [];
  let sent = 0, failed = 0, skipped = 0, limitHit = false;
  const errors = [];
  for (const email of list) {
    if (dailyLimit && sent >= dailyLimit) { limitHit = true; break; }
    if (claim && !(await claim(email))) { skipped++; continue; } // 併發佔位失敗＝已有人處理
    let res;
    try {
      res = await send(email);
    } catch (e) {
      res = { success: false, error: e.message };
    }
    if (res?.limitHit) { if (release) await release(email); limitHit = true; break; }
    if (res?.success) { sent++; }
    else { failed++; errors.push(`${email}: ${res?.error || "send_failed"}`); if (release) await release(email); }
  }
  return { total: list.length, sent, failed, skipped, limitHit, errors };
}
