import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { verifyAdminToken } from "@/lib/adminAuth";
import { renderNewsletterHtml } from "@/lib/newsletter";
import { contentHash, claimSend, releaseSend } from "@/lib/newsletter-send";
import { sendNewsletterEmail } from "@/lib/brevo-email";
import { buildUnsubscribeUrl, excludeUnsubscribed } from "@/lib/unsubscribe";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";

export const maxDuration = 300;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RECIPIENTS = 200;

// 只有「newsletter_sends 這張表還沒建」才算相容情境（新環境尚未跑 supabase-deploy.sql）。
// 42P01＝Postgres undefined_table、PGRST205＝PostgREST 找不到表；經 claimSend 包過只剩 message，故也比對訊息。
function isMissingTable(err) {
  const code = String(err?.code || "");
  if (code === "42P01" || code === "PGRST205") return true;
  return /does not exist|schema cache/i.test(String(err?.message || ""));
}

// 送前原子佔位。回 "go"（搶到，寄）／"skip"（別人已在寄）／"error"（DB 異常，這封不寄、列入失敗）。
// 表不存在時降級成舊行為（照寄、無冪等）並記 log，不讓後台批次追單整個壞掉。
async function claimOne(supabase, hash, to) {
  if (!supabase) return "go";
  try { return (await claimSend(supabase, hash, to)) ? "go" : "skip"; }
  catch (e) {
    if (isMissingTable(e)) { console.error("[bulk-followup] 寄送記錄表不存在（降級照寄、無冪等）:", e?.message || e); return "go"; }
    console.error("[bulk-followup] 佔位失敗（此封不寄）", to, e?.message || e);
    return "error";
  }
}
async function releaseQuietly(supabase, hash, to) {
  if (!supabase) return;
  try { await releaseSend(supabase, hash, to); }
  catch (e) { console.error("[bulk-followup] 退回佔位失敗", to, e?.message || e); }
}

// 後台「批次追單」：對一批未付款/失敗訂單的消費者，一次寄出同一封追單信。
// 重用電子報的 Markdown→HTML、退訂機制與 Brevo 寄送；逐封「先佔位再寄」、彙整成功/失敗。
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

  const supabase = getSupabaseAdmin();
  // 已按過取消訂閱的人不再收行銷信。讀不到退訂名單時 lib/unsubscribe.js 會丟錯（fail-closed），
  // 這裡照樣中止：寧可整批不寄，也不能寄給已退訂的人。
  let recipients;
  try {
    recipients = supabase ? await excludeUnsubscribed(supabase, list) : list;
  } catch (e) {
    return serverError(e, "unsubscribe_list_unavailable");
  }
  const unsubscribed = list.length - recipients.length;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://inrecordmusic.com";
  const unsubUrl = (to) => buildUnsubscribeUrl(to, siteUrl);
  // 內容指紋（與電子報共用 newsletter_sends，前綴自成命名空間、不與電子報互相蓋掉）：
  // 同一封追單內容對同一人只寄一次 → 重複點擊／前端逾時重試不會讓顧客收到兩封。
  const hash = `followup:${contentHash(subj, body)}`;

  const failed = [];
  let sent = 0, skipped = 0;
  // 逐封寄送：先原子佔位（搶不到＝已有人在寄，跳過），寄失敗退回佔位保留重寄機會。
  // HTML 逐封渲染——退訂連結是每位收件人專屬的簽章連結。
  for (const to of recipients) {
    const claim = await claimOne(supabase, hash, to);
    if (claim === "skip") { skipped++; continue; }
    if (claim === "error") { failed.push({ to, error: "claim_failed" }); continue; }
    try {
      const html = renderNewsletterHtml({ subject: subj, bodyMd: body, siteUrl, unsubscribeUrl: unsubUrl(to), reasonLine: "你收到這封信，是因為你曾在 InRecord 下單，但訂單還沒完成付款。" });
      const r = await sendNewsletterEmail({ to, subject: subj, html, unsubscribeUrl: unsubUrl(to), kind: "followup" });
      if (r?.success) sent++;
      else { failed.push({ to, error: r?.error || "send_failed" }); await releaseQuietly(supabase, hash, to); }
    } catch (e) {
      console.error("[bulk-followup]", to, e?.message);
      failed.push({ to, error: "send_failed" });
      await releaseQuietly(supabase, hash, to);
    }
  }

  console.log(`[bulk-followup] 已寄 ${sent}/${list.length}，失敗 ${failed.length}，已退訂 ${unsubscribed}，跳過 ${skipped}`);
  await logAudit(supabase, {
    actor: payload.email,
    action: "email.bulk_followup",
    targetType: "email",
    targetId: `${list.length} 位收件人`,
    meta: { subject: subj, total: list.length, sent, failed: failed.length, unsubscribed, skipped },
    req,
  });

  return NextResponse.json({ ok: true, total: list.length, sent, failed, unsubscribed, skipped });
}
