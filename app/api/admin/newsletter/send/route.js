import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { renderNewsletterHtml } from "@/lib/newsletter";
import {
  gatherAudienceEmails, sendNewsletterBatch,
  contentHash, filterUnsent, countSentToday, claimSend, releaseSend,
} from "@/lib/newsletter-send";
import { sendNewsletterEmail } from "@/lib/brevo-email";
import { buildUnsubscribeUrl } from "@/lib/unsubscribe";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 300; // 群發逐封寄，給足執行時間

const DAILY_LIMIT = Number(process.env.NEWSLETTER_DAILY_LIMIT || 300);

// 群發電子報。Body { audience: 'buyers'|'registered', test?: boolean, brevoTemplateId?: number }。
// test=true 只寄給 ADMIN_EMAIL；否則撈該對象名單逐封寄、碰每日上限即停並回報。
// brevoTemplateId：改用 Brevo 後台的 transactional 範本（主旨／內容以 Brevo 為準、不讀本地草稿），
// 去重指紋改為 brevo-template:<id>（同一範本對同一人只寄一次；範本改版想重寄要換新範本 id）。
export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { audience, test, brevoTemplateId } = await req.json().catch(() => ({}));
  const templateId = Number.isInteger(brevoTemplateId) && brevoTemplateId > 0 ? brevoTemplateId : null;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  // 每位收件人專屬的退訂連結（HMAC 簽章）：內文按鈕＋List-Unsubscribe 標頭；Brevo 範本走 params.unsubscribe_url
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://inrecordmusic.com";
  const unsubUrl = (to) => buildUnsubscribeUrl(to, siteUrl);
  let subject, body_md = "", sendOne;
  if (templateId) {
    subject = `[Brevo 範本 #${templateId}]`; // 只作 email_log／稽核標示，實際主旨由 Brevo 範本決定
    sendOne = (to) => sendNewsletterEmail({ to, subject, templateId, params: { unsubscribe_url: unsubUrl(to) }, unsubscribeUrl: unsubUrl(to) });
  } else {
    // 讀草稿（寄送以 DB 內容為準）；HTML 逐封渲染（退訂連結因人而異，渲染成本可忽略）
    const { data: nl } = await supabase.from("newsletter").select("subject, body_md").eq("id", "default").maybeSingle();
    subject = (nl?.subject || "").trim();
    body_md = nl?.body_md || "";
    if (!subject || !body_md.trim()) return NextResponse.json({ error: "empty_content" }, { status: 400 });
    sendOne = (to) => sendNewsletterEmail({ to, subject, html: renderNewsletterHtml({ subject, bodyMd: body_md, siteUrl, unsubscribeUrl: unsubUrl(to) }), unsubscribeUrl: unsubUrl(to) });
  }

  // 測試信：只寄管理員自己
  if (test) {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) return NextResponse.json({ error: "no_admin_email" }, { status: 400 });
    const r = await sendOne(adminEmail);
    return NextResponse.json({ ok: !!r.success, test: true, to: adminEmail, templateId, error: r.error });
  }

  // 正式群發
  if (audience !== "buyers" && audience !== "registered") {
    return NextResponse.json({ error: "bad_audience" }, { status: 400 });
  }

  // 內容指紋：用來在 newsletter_sends 去重（同一封內容重跑/重按不重寄）。
  const hash = templateId ? `brevo-template:${templateId}` : contentHash(subject, body_md);
  let emails, pending, sentToday;
  try {
    emails = await gatherAudienceEmails(supabase, audience);
    pending = await filterUnsent(supabase, hash, emails); // 跳過這封已寄過的對象
    sentToday = await countSentToday(supabase);            // 今日實際已寄（跨呼叫累計）
  } catch (e) {
    return serverError(e);
  }
  const alreadySent = emails.length - pending.length;
  const remaining = Math.max(0, DAILY_LIMIT - sentToday); // 真正的每日剩餘額度

  if (!pending.length || remaining === 0) {
    return NextResponse.json({
      ok: true, audience, total: emails.length, alreadySent,
      sent: 0, failed: 0, limitHit: remaining === 0, errors: [],
    });
  }

  const result = await sendNewsletterBatch({
    emails: pending,
    dailyLimit: remaining,
    claim:   (to) => claimSend(supabase, hash, to),   // 送前原子佔位，防併發重寄
    release: (to) => releaseSend(supabase, hash, to), // 送失敗退回佔位，保留重寄機會
    send:    sendOne,
  });

  await supabase
    .from("newsletter")
    .update({ last_sent_at: new Date().toISOString(), last_sent_count: result.sent })
    .eq("id", "default");

  await logAudit(supabase, { actor: payload.email, action: "newsletter.send", targetType: "newsletter", targetId: audience, meta: { audience, templateId, sent: result.sent, failed: result.failed, alreadySent }, req });
  return NextResponse.json({ ok: true, audience, templateId, alreadySent, ...result });
}
