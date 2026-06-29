import { NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/adminAuth";
import { renderAdminEmailHtml } from "@/lib/newsletter";
import { sendNewsletterEmail } from "@/lib/brevo-email";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 後台「單封自訂信」：對單一消費者寄一封自己編輯的信（追單/客服）。
// 重用電子報的 Markdown→HTML（renderAdminEmailHtml，中性 footer）與 Brevo 寄送。
export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { to, subject, bodyMd } = await req.json().catch(() => ({}));
  const email = String(to || "").trim().toLowerCase();
  const subj = String(subject || "").trim();
  const body = String(bodyMd || "").trim();
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  if (!subj) return NextResponse.json({ error: "missing_subject" }, { status: 400 });
  if (!body) return NextResponse.json({ error: "missing_body" }, { status: 400 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://inrecordmusic.com";
  const html = renderAdminEmailHtml({ subject: subj, bodyMd: body, siteUrl });

  const r = await sendNewsletterEmail({ to: email, subject: subj, html });
  if (!r?.success) {
    console.error("[send-custom-email] 失敗", email, r?.error || "");
    return NextResponse.json({ error: r?.error || "send_failed", skipped: !!r?.skipped }, { status: 500 });
  }
  console.log("[send-custom-email] 已寄", email, "|", subj);
  await logAudit(getSupabaseAdmin(), { actor: payload.email, action: "email.custom_send", targetType: "email", targetId: email, meta: { subject: subj }, req });
  return NextResponse.json({ ok: true });
}
