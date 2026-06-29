// lib/email-log.js — 所有對外寄信的統一紀錄（盡力而為、絕不因記錄失敗中斷寄信）。
// 與 admin_audit_log 互補：audit 記「管理員做了什麼」，email_log 記「每一封信寄給誰、成功沒」。
import { getSupabaseAdmin } from "./supabase.js";

export async function recordEmail({ to, subject = null, kind = null, status = "sent", error = null } = {}) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase || !to) return;
    await supabase.from("email_log").insert({
      to_email: String(to).trim().toLowerCase(),
      subject,
      kind,                                  // 'purchase' | 'launch' | 'newsletter' | 'custom' | 'presale'
      status,                                // 'sent' | 'failed' | 'skipped'
      error: error ? String(error).slice(0, 500) : null,
    });
  } catch (e) {
    console.error("[email-log] 記錄失敗（不中斷寄信）", e?.message || e);
  }
}
