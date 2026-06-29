import { NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/adminAuth";
import { renderAdminEmailHtml } from "@/lib/newsletter";
import { sendNewsletterEmail } from "@/lib/brevo-email";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";

export const maxDuration = 300;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RECIPIENTS = 200;

// 後台「批次追單」：對一批未付款/失敗訂單的消費者，一次寄出同一封追單信。
// 重用電子報的 Markdown→HTML 與 Brevo 寄送；逐封寄送、彙整成功/失敗。
export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { emails, subject, bodyMd } = await req.json().catch(() => ({}));
  const subj = String(subject || "").trim();
  const body = String(bodyMd || "").trim();
  if (!subj) return NextResponse.json({ error: "missing_subject" }, { status: 400 });
  if (!body) return NextResponse.json({ error: "missing_body" }, { status: 400 });

  // 去重 + 正規化 + 驗證，過濾無效信箱
  const list = Array.from(new Set(
    (Array.isArray(emails) ? emails : [])
      .map(e => String(e || "").trim().toLowerCase())
      .filter(e => EMAIL_RE.test(e))
  ));
  if (!list.length) return NextResponse.json({ error: "no_valid_recipients" }, { status: 400 });
  if (list.length > MAX_RECIPIENTS) return NextResponse.json({ error: "too_many_recipients", max: MAX_RECIPIENTS }, { status: 400 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://inrecordmusic.com";
  const html = renderAdminEmailHtml({ subject: subj, bodyMd: body, siteUrl });

  const failed = [];
  let sent = 0;
  // 逐封寄送（每封都會經由 sendNewsletterEmail 落地 email_log）。
  for (const to of list) {
    try {
      const r = await sendNewsletterEmail({ to, subject: subj, html, kind: "followup" });
      if (r?.success) sent++;
      else failed.push({ to, error: r?.error || "send_failed" });
    } catch (e) {
      failed.push({ to, error: e?.message || "exception" });
    }
  }

  console.log(`[bulk-followup] 已寄 ${sent}/${list.length}，失敗 ${failed.length}`);
  await logAudit(getSupabaseAdmin(), {
    actor: payload.email,
    action: "email.bulk_followup",
    targetType: "email",
    targetId: `${list.length} 位收件人`,
    meta: { subject: subj, total: list.length, sent, failed: failed.length },
    req,
  });

  return NextResponse.json({ ok: true, total: list.length, sent, failed });
}
