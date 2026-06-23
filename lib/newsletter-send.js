// lib/newsletter-send.js — 電子報名單擷取 + 逐封寄送編排（依賴注入 supabase / send，可測）。
import { dedupeEmails } from "./newsletter.js";

// 依對象撈出收件 email：
//   buyers     → enrollments.email（已開通課程者）
//   registered → Supabase Auth 使用者 email（分頁取完）
export async function gatherAudienceEmails(supabase, audience) {
  if (audience === "buyers") {
    const { data, error } = await supabase.from("enrollments").select("email");
    if (error) throw new Error(error.message);
    return dedupeEmails((data || []).map((r) => r.email));
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
    return dedupeEmails(emails);
  }
  throw new Error("unknown_audience:" + audience);
}

// 逐封寄送。send(email) 回 { success, limitHit?, error? }。
// 遇 limitHit 立即停止（Brevo 觸頂）；dailyLimit 為自我上限（已寄達標也停）。
export async function sendNewsletterBatch({ emails, send, dailyLimit }) {
  const list = Array.isArray(emails) ? emails : [];
  let sent = 0, failed = 0, limitHit = false;
  const errors = [];
  for (const email of list) {
    if (dailyLimit && sent >= dailyLimit) { limitHit = true; break; }
    let res;
    try {
      res = await send(email);
    } catch (e) {
      res = { success: false, error: e.message };
    }
    if (res?.limitHit) { limitHit = true; break; }
    if (res?.success) sent++;
    else { failed++; errors.push(`${email}: ${res?.error || "send_failed"}`); }
  }
  return { total: list.length, sent, failed, limitHit, errors };
}
