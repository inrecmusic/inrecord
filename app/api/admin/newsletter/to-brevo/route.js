import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { renderNewsletterHtml } from "@/lib/newsletter";
import { normalizeDraftId } from "@/lib/newsletter-drafts";
import { logAudit } from "@/lib/audit";

// 把後台草稿推成 Brevo 的 transactional 範本，讓它能被 Brevo 的 Automation（自動化流程）選用。
//
// 為什麼要這一步：Brevo 的 Automation 只能在 Brevo 後台建，**沒有 API**；但它寄的信可以選現成範本。
// 所以流程是：內容在我們後台寫（版面、吉祥物、時間軸都在這裡）→ 推成 Brevo 範本 → 在 Brevo 拉流程。
//
// 退訂連結：Brevo 在 Automation／行銷信會自動附上自己的退訂連結，所以這裡用 {{ unsubscribe }}
// 交給 Brevo 取代，不寫我們自己的 HMAC 連結（那把簽章只有我們的 /unsubscribe 認得）。
//
// 同名範本＝更新不是重複建：以 templateName「InRecord｜<草稿代號>」比對，避免每次推都長出一個新範本。
export const maxDuration = 30;

const NAME = (id) => `InRecord｜${id}`;

export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const apiKey = process.env.BREVO_API_KEY;
  const sender = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !sender) return NextResponse.json({ error: "missing_brevo_config" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const id = normalizeDraftId(body?.id);
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const { data: nl, error } = await supabase.from("newsletter").select("subject, body_md").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: "server_error" }, { status: 500 });
  if (!nl?.body_md) return NextResponse.json({ error: "draft_empty" }, { status: 404 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://inrecordmusic.com";
  const html = renderNewsletterHtml({
    subject: nl.subject || id,
    bodyMd: nl.body_md,
    siteUrl,
    unsubscribeUrl: "{{ unsubscribe }}",
    reasonLine: "你收到這封信，是因為你曾在 InRecord 官網留下 Email 索取免費試看。",
  });

  const tpl = {
    templateName: NAME(id),
    subject: nl.subject || id,
    htmlContent: html,
    sender: { email: sender, name: process.env.BREVO_SENDER_NAME || "InRecord 音樂刻" },
    replyTo: process.env.BREVO_REPLY_TO || "support@inrecordmusic.com",
    isActive: true,
    tag: "inrecord-draft",
  };

  const hdr = { "Content-Type": "application/json", "api-key": apiKey };
  try {
    // 先找同名範本（分頁上限 200 已遠大於實際草稿數）
    const listRes = await fetch("https://api.brevo.com/v3/smtp/templates?limit=200&sort=desc", { headers: hdr, cache: "no-store" });
    const list = listRes.ok ? await listRes.json().catch(() => ({})) : {};
    const existing = (list.templates || []).find((t) => t.name === NAME(id));

    const res = existing
      ? await fetch(`https://api.brevo.com/v3/smtp/templates/${existing.id}`, { method: "PUT", headers: hdr, body: JSON.stringify(tpl) })
      : await fetch("https://api.brevo.com/v3/smtp/templates", { method: "POST", headers: hdr, body: JSON.stringify(tpl) });

    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      console.error("[to-brevo] failed", res.status, detail);
      return NextResponse.json({ error: `brevo_${res.status}`, detail }, { status: 502 });
    }
    const out = res.status === 204 ? {} : await res.json().catch(() => ({}));
    const templateId = existing ? existing.id : out.id;

    await logAudit(supabase, {
      actor: payload.email, action: "newsletter.to_brevo", targetType: "newsletter", targetId: id,
      meta: { templateId, updated: !!existing }, req,
    });
    return NextResponse.json({ ok: true, id, templateId, updated: !!existing, name: NAME(id) });
  } catch (e) {
    console.error("[to-brevo] unreachable", e?.message || e);
    return NextResponse.json({ error: "brevo_unreachable" }, { status: 502 });
  }
}
