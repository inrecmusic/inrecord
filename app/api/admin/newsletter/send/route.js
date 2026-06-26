import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { renderNewsletterHtml } from "@/lib/newsletter";
import {
  gatherAudienceEmails, sendNewsletterBatch,
  contentHash, filterUnsent, countSentToday, recordSent,
} from "@/lib/newsletter-send";
import { sendNewsletterEmail } from "@/lib/brevo-email";

export const runtime = "nodejs";
export const maxDuration = 300; // 群發逐封寄，給足執行時間

const DAILY_LIMIT = Number(process.env.NEWSLETTER_DAILY_LIMIT || 300);

// 群發電子報。Body { audience: 'buyers'|'registered', test?: boolean }。
// test=true 只寄給 ADMIN_EMAIL；否則撈該對象名單逐封寄、碰每日上限即停並回報。
export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { audience, test } = await req.json().catch(() => ({}));

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  // 讀草稿（寄送以 DB 內容為準）
  const { data: nl } = await supabase.from("newsletter").select("subject, body_md").eq("id", "default").maybeSingle();
  const subject = (nl?.subject || "").trim();
  const body_md = nl?.body_md || "";
  if (!subject || !body_md.trim()) return NextResponse.json({ error: "empty_content" }, { status: 400 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://inrecordmusic.com";
  const html = renderNewsletterHtml({ subject, bodyMd: body_md, siteUrl });

  // 測試信：只寄管理員自己
  if (test) {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) return NextResponse.json({ error: "no_admin_email" }, { status: 400 });
    const r = await sendNewsletterEmail({ to: adminEmail, subject, html });
    return NextResponse.json({ ok: !!r.success, test: true, to: adminEmail, error: r.error });
  }

  // 正式群發
  if (audience !== "buyers" && audience !== "registered") {
    return NextResponse.json({ error: "bad_audience" }, { status: 400 });
  }

  // 內容指紋：用來在 newsletter_sends 去重（同一封內容重跑/重按不重寄）。
  const hash = contentHash(subject, body_md);
  let emails, pending, sentToday;
  try {
    emails = await gatherAudienceEmails(supabase, audience);
    pending = await filterUnsent(supabase, hash, emails); // 跳過這封已寄過的對象
    sentToday = await countSentToday(supabase);            // 今日實際已寄（跨呼叫累計）
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
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
    send: (to) => sendNewsletterEmail({ to, subject, html }),
    onSent: (to) => recordSent(supabase, hash, to),
  });

  await supabase
    .from("newsletter")
    .update({ last_sent_at: new Date().toISOString(), last_sent_count: result.sent })
    .eq("id", "default");

  return NextResponse.json({ ok: true, audience, alreadySent, ...result });
}
