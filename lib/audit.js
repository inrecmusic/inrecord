// lib/audit.js — 後台操作稽核紀錄（盡力而為、絕不因記錄失敗而中斷主流程）。
// 對金錢/存取權/個資相關的敏感操作落地 who/what/when/target/meta/ip，供究責與還原時序。
import { clientIp } from "./rate-limit.js";

export async function logAudit(supabase, { actor = null, action, targetType = null, targetId = null, meta = null, req = null } = {}) {
  try {
    if (!supabase || !action) return;
    await supabase.from("admin_audit_log").insert({
      actor_email: actor || null,
      action,                                   // 例：'order.refund' / 'course.grant' / 'coupon.update'
      target_type: targetType,                  // 'order' | 'coupon' | 'email' | 'sale_settings' | 'subscription' ...
      target_id: targetId != null ? String(targetId) : null,
      meta: meta || null,                       // before/after、金額、收件人等
      ip: req ? clientIp(req) : null,
    });
  } catch (e) {
    console.error("[audit] 記錄失敗（不中斷主流程）", action, e?.message || e);
  }
}
