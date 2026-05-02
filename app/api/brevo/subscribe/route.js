// app/api/brevo/subscribe/route.js
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const BREVO_BASE = "https://api.brevo.com/v3";

function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || ""); }
function isGmail(e) { return /@(gmail\.com|googlemail\.com)$/i.test(e || ""); }

async function brevoFetch(path, options = {}) {
  if (!process.env.BREVO_API_KEY) throw new Error("missing_BREVO_API_KEY");
  const res = await fetch(`${BREVO_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", "api-key": process.env.BREVO_API_KEY, ...(options.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function upsertContact({ email, tags, source, course }) {
  const listId = Number(process.env.BREVO_LIST_ID);
  if (!listId) throw new Error("missing_BREVO_LIST_ID");
  const payload = {
    email, listIds: [listId], updateEnabled: true,
    attributes: { SOURCE: source, COURSE: course, TAGS: tags.join(","), DEMO_STATUS: "REQUESTED", DEMO_REQUESTED_AT: new Date().toISOString() }
  };
  const r = await brevoFetch("/contacts", { method: "POST", body: JSON.stringify(payload) });
  if (r.ok) return r.data;
  const upd = await brevoFetch(`/contacts/${encodeURIComponent(email)}`, { method: "PUT", body: JSON.stringify({ listIds: [listId], attributes: payload.attributes }) });
  if (!upd.ok) throw new Error(`brevo_contact_failed_${upd.status}`);
  return upd.data;
}

async function sendEmail({ email, course, demoUrl }) {
  const safeCourse = course || "零基礎流行鋼琴入門課";
  const safeUrl = demoUrl || process.env.DEMO_URL || "https://example.com/#courseDemo";
  if (process.env.BREVO_TEMPLATE_ID) {
    const r = await brevoFetch("/smtp/email", { method: "POST", body: JSON.stringify({ templateId: Number(process.env.BREVO_TEMPLATE_ID), to: [{ email }], params: { COURSE: safeCourse, DEMO_URL: safeUrl } }) });
    if (!r.ok) throw new Error(`brevo_email_failed_${r.status}`);
    return r.data;
  }
  if (!process.env.BREVO_SENDER_EMAIL) throw new Error("missing_BREVO_SENDER_EMAIL_or_TEMPLATE_ID");
  const r = await brevoFetch("/smtp/email", {
    method: "POST",
    body: JSON.stringify({
      sender: { name: process.env.BREVO_SENDER_NAME || "InRecord", email: process.env.BREVO_SENDER_EMAIL },
      to: [{ email }],
      subject: `你的《${safeCourse}》課程試看來了`,
      htmlContent: `<div style="font-family:sans-serif;padding:24px;background:#f6f7fb;"><div style="max-width:620px;margin:0 auto;background:#fff;border-radius:18px;padding:28px;border:1px solid #e5e7eb;"><h1>你的課程試看已開通</h1><p>這堂試看會帶你從鍵盤佈局、中央 C、音名 ABCDEFG 開始，建立你的第一個鋼琴學習地圖。</p><a href="${safeUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:12px;">▶ 前往課程試看</a></div></div>`
    })
  });
  if (!r.ok) throw new Error(`brevo_email_failed_${r.status}`);
  return r.data;
}

async function saveLeadToSupabase({ email, tags, source, course }) {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("course_preview_leads").upsert(
      { email: email.toLowerCase(), course, source, tags, status: "email_sent", email_sent: true, email_sent_at: new Date().toISOString() },
      { onConflict: "email" }
    );
    if (error) console.error("[supabase upsert error]", error);
  } catch (err) {
    console.error("[supabase error]", err.message);
    // Supabase 未設定時不中斷流程
  }
}

export async function POST(req) {
  const { email, tags = ["piano_demo_lead", "course_preview"], source = "course_preview_modal", course = "零基礎流行鋼琴入門課", demoUrl } = await req.json();

  // 後台測試用
  if (email === "_test_admin@gmail.com") {
    if (!process.env.BREVO_API_KEY) return NextResponse.json({ error: "missing_BREVO_API_KEY" }, { status: 500 });
    return NextResponse.json({ ok: true, test: true });
  }

  if (!isValidEmail(email)) return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  if (!isGmail(email))      return NextResponse.json({ error: "google_email_required" }, { status: 400 });

  try {
    const contact = await upsertContact({ email, tags, source, course });
    const emailResult = await sendEmail({ email, course, demoUrl });
    await saveLeadToSupabase({ email, tags, source, course });
    return NextResponse.json({ ok: true, contact, emailResult });
  } catch (err) {
    console.error("[brevo subscribe error]", err);
    return NextResponse.json({ error: "brevo_workflow_failed", message: err.message }, { status: 500 });
  }
}
