import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { addLeadContact } from "@/lib/brevo-contacts";
import { normalizeEmail } from "@/lib/unsubscribe";
import { createDistributedLimiter, clientIp } from "@/lib/rate-limit";
import { sendNewsletterEmail } from "@/lib/brevo-email";
import { buildTrialEmail } from "@/lib/trial";

// 公開端點：首頁「留下 Email」→ 加進 Brevo 潛客清單。單次同意：勾選（consent=true）才收，送出即進名單。
// 名單只存 Brevo（BREVO_LIST_ID）；屬性記來源／同意時間／UTM 來源，之後看得出哪個廣告帶來多少名單。
// 進名單後立刻寄「免費試看」信（Email 專屬簽章連結 → /trial）；信寄失敗不影響已進名單，回 trialSent=false 讓前端提示。
const limiter = createDistributedLimiter({ limit: 10, windowMs: 60_000, prefix: "rl:subscribe" });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UTM_ATTRS = { utm_source: "UTM_SOURCE", utm_medium: "UTM_MEDIUM", utm_campaign: "UTM_CAMPAIGN" };

export async function POST(req) {
  const rl = await limiter(clientIp(req));
  if (!rl.allowed) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  const email = normalizeEmail(body.email);
  if (!EMAIL_RE.test(email) || email.length > 254) return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  if (body.consent !== true) return NextResponse.json({ ok: false, error: "consent_required" }, { status: 400 });

  const attributes = { SOURCE: "website", CONSENT_AT: new Date().toISOString() };
  const attr = body.attribution && typeof body.attribution === "object" ? body.attribution : {};
  for (const [key, name] of Object.entries(UTM_ATTRS)) {
    if (typeof attr[key] === "string" && attr[key]) attributes[name] = attr[key].slice(0, 100);
  }

  const r = await addLeadContact({ email, attributes });
  if (!r.ok) {
    console.error("[subscribe] brevo failed:", r.error, r.detail || "");
    return NextResponse.json({ ok: false, error: r.error }, { status: r.error === "missing_brevo_config" ? 503 : 502 });
  }
  // 之前按過「取消訂閱」又回來留信箱＝重新同意 → 從退訂名單移除（失敗不影響訂閱結果）
  try {
    const sb = getSupabaseAdmin();
    if (sb) await sb.from("newsletter_unsubscribes").delete().eq("email", email);
  } catch (e) {
    console.error("[subscribe] unsubscribe cleanup failed:", e?.message || e);
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://inrecordmusic.com";
  const { subject, html } = buildTrialEmail({ email, siteUrl });
  const mail = await sendNewsletterEmail({ to: email, subject, html, kind: "trial" });
  if (!mail.success) console.error("[subscribe] trial email failed:", mail.error);
  return NextResponse.json({ ok: true, trialSent: mail.success === true });
}
