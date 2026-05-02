// api/brevo/subscribe.js
// Brevo：加入課程試看名單 + 自動寄送試看 Email
// 請把 BREVO_API_KEY 放在後端環境變數，不要放前端。

const BREVO_BASE_URL = "https://api.brevo.com/v3";

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
}

function isGoogleEmail(email) {
  return /@(gmail\.com|googlemail\.com)$/i.test(email || "");
}

async function brevoFetch(path, options = {}) {
  if (!process.env.BREVO_API_KEY) throw new Error("missing_BREVO_API_KEY");
  const response = await fetch(`${BREVO_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "api-key": process.env.BREVO_API_KEY,
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

async function upsertContact({ email, tags, source, course }) {
  const listId = Number(process.env.BREVO_LIST_ID);
  if (!listId) throw new Error("missing_BREVO_LIST_ID");
  const payload = {
    email,
    listIds: [listId],
    updateEnabled: true,
    attributes: {
      SOURCE: source || "course_preview_modal",
      COURSE: course || "零基礎流行鋼琴入門課",
      TAGS: Array.isArray(tags) ? tags.join(",") : "piano_demo_lead",
      DEMO_STATUS: "REQUESTED",
      DEMO_REQUESTED_AT: new Date().toISOString()
    }
  };
  const result = await brevoFetch("/contacts", { method: "POST", body: JSON.stringify(payload) });
  if (result.ok) return result.data;
  const updated = await brevoFetch(`/contacts/${encodeURIComponent(email)}`, {
    method: "PUT",
    body: JSON.stringify({ listIds: [listId], attributes: payload.attributes })
  });
  if (!updated.ok) throw new Error(`brevo_contact_failed_${updated.status}`);
  return updated.data;
}

function emailPayload({ email, course, demoUrl }) {
  const safeCourse = course || "零基礎流行鋼琴入門課";
  const safeDemoUrl = demoUrl || process.env.DEMO_URL || "https://example.com/#courseDemo";
  if (process.env.BREVO_TEMPLATE_ID) {
    return {
      templateId: Number(process.env.BREVO_TEMPLATE_ID),
      to: [{ email }],
      params: { COURSE: safeCourse, DEMO_URL: safeDemoUrl }
    };
  }
  return {
    sender: { name: process.env.BREVO_SENDER_NAME || "InRecord", email: process.env.BREVO_SENDER_EMAIL },
    to: [{ email }],
    subject: `你的《${safeCourse}》課程試看來了`,
    htmlContent: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans TC','Microsoft JhengHei',sans-serif;line-height:1.7;color:#171717;padding:24px;background:#f6f7fb;"><div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:18px;padding:28px;border:1px solid #e5e7eb;"><h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;">你的課程試看已開通</h1><p style="margin:0 0 18px;color:#555;">你好，這是你申請的《${safeCourse}》課程試看內容。</p><p style="margin:0 0 22px;color:#555;">這堂試看會帶你從鍵盤佈局、中央 C、音名 ABCDEFG 開始，建立你的第一個鋼琴學習地圖。</p><a href="${safeDemoUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:12px;">前往課程試看</a></div></div>`
  };
}

async function sendDemoEmail(args) {
  if (!process.env.BREVO_SENDER_EMAIL && !process.env.BREVO_TEMPLATE_ID) throw new Error("missing_BREVO_SENDER_EMAIL_or_TEMPLATE_ID");
  const result = await brevoFetch("/smtp/email", { method: "POST", body: JSON.stringify(emailPayload(args)) });
  if (!result.ok) throw new Error(`brevo_email_failed_${result.status}`);
  return result.data;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
    const { email, tags = ["piano_demo_lead", "course_preview", "zero_basic_piano"], source = "course_preview_modal", course = "零基礎流行鋼琴入門課", demoUrl } = req.body || {};
    if (!isValidEmail(email)) return res.status(400).json({ error: "invalid_email" });
    if (!isGoogleEmail(email)) return res.status(400).json({ error: "google_email_required" });
    const contact = await upsertContact({ email, tags, source, course });
    const emailResult = await sendDemoEmail({ email, course, demoUrl });
    return res.status(200).json({ ok: true, contact, emailResult });
  } catch (error) {
    console.error("[brevo subscribe error]", error);
    return res.status(500).json({ error: "brevo_workflow_failed", message: error.message });
  }
}
