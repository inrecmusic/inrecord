// Brevo transactional email — 購買成功開課確認信（純 HTML，不依賴 Template）

// 各方案開通內容文案
const PLAN_UNLOCK = {
  course: "線上課程《零基礎流行鋼琴入門課》（永久觀看）",
  bundle: "線上課程《零基礎流行鋼琴入門課》＋ AI 練習遊戲（皆永久）",
  game:   "AI 練習遊戲（永久使用）",
};

// HTML 跳脫：縱深防禦。目前 planLabel/planUnlock/merTradeNo 皆為後端來源（非使用者輸入），
// 但仍一律跳脫，避免日後有人把使用者輸入接進 plan_label 等欄位造成收件匣 HTML 注入。
function esc(s, max = 200) {
  return String(s ?? "")
    .slice(0, max)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHtml({ planLabel, planUnlock, merTradeNo, loginUrl, presale }) {
  // 預售期間教室尚未開放（見 middleware.js 的 PRESALE 鎖站），故文案改為
  // 「預購成功、開課後 Email 通知」，並移除會把人導向鎖住教室的登入按鈕。
  const heading = presale ? "預購成功，感謝你的支持！" : "購買成功，課程已開通！";
  const intro = presale
    ? "你已完成預購，課程正式開課後我們會以 Email 通知你登入學習。"
    : "感謝你加入 InRecord，以下是你的開通資訊。";
  const unlockLabel = presale ? "預購方案內容" : "開通內容";
  const cta = presale
    ? `<div style="background:#eff6ff;border:1px solid #dbeafe;border-radius:12px;padding:16px 18px;text-align:center;margin-bottom:20px;">
        <p style="margin:0;color:#1e40af;font-size:14px;font-weight:800;">📅 課程開課後將以 Email 通知</p>
        <p style="margin:7px 0 0;color:#3b82f6;font-size:13px;line-height:1.7;">屆時即可使用本次購買的 Email 登入學習，請留意收信。</p>
      </div>`
    : `<div style="text-align:center;margin-bottom:20px;">
        <a href="${loginUrl}" style="display:inline-block;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;font-weight:800;padding:14px 32px;border-radius:12px;text-decoration:none;font-size:15px;">前往課程登入</a>
      </div>`;
  const footer = presale
    ? "開課通知將寄送至<strong>本次購買的 Email</strong>，請留意收信。<br>如有任何問題，直接回覆此信與我們聯絡。"
    : "請使用<strong>本次購買的 Email</strong>登入即可看到已開通的內容。<br>如有任何問題，直接回覆此信與我們聯絡。";
  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f1f5f9;font-family:-apple-system,'Helvetica Neue',Arial,'PingFang TC','Microsoft JhengHei',sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px;">
    <div style="background:#fff;border-radius:20px;padding:36px 32px;box-shadow:0 12px 40px rgba(15,23,42,.08);">
      <div style="font-size:48px;text-align:center;margin-bottom:8px;">🎹</div>
      <h1 style="font-size:24px;color:#0f172a;text-align:center;margin:0 0 6px;letter-spacing:-.02em;">${heading}</h1>
      <p style="color:#64748b;font-size:15px;text-align:center;margin:0 0 24px;">${intro}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#334155;margin-bottom:24px;">
        <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#94a3b8;">購買方案</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;">${esc(planLabel)}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#94a3b8;">${unlockLabel}</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;text-align:right;">${esc(planUnlock)}</td></tr>
        <tr><td style="padding:10px 0;color:#94a3b8;">訂單編號</td><td style="padding:10px 0;text-align:right;font-family:monospace;">${esc(merTradeNo)}</td></tr>
      </table>
      ${cta}
      <p style="color:#64748b;font-size:13px;line-height:1.7;text-align:center;margin:0;">${footer}</p>
    </div>
    <p style="color:#94a3b8;font-size:12px;text-align:center;margin:18px 0 0;">InRecord · 零基礎流行鋼琴入門課</p>
  </div>
</body></html>`;
}

export async function sendPurchaseEmail({ email, plan, planLabel, merTradeNo }) {
  const apiKey = process.env.BREVO_API_KEY;
  const sender = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !sender) {
    return { success: false, skipped: true, error: "missing_brevo_config" };
  }

  const siteUrl  = process.env.NEXT_PUBLIC_SITE_URL || "https://inrecordmusic.com";
  const loginUrl = `${siteUrl}/classroom/login`;
  const planUnlock = PLAN_UNLOCK[plan] || "已購買內容";
  const presale = process.env.NEXT_PUBLIC_PRESALE_MODE === "1";

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender: { email: sender, name: process.env.BREVO_SENDER_NAME || "InRecord" },
        replyTo: { email: process.env.BREVO_REPLY_TO || "service@inrecordmusic.com", name: "InRecord 客服" },
        to: [{ email }],
        subject: presale
          ? "InRecord｜預購成功，感謝你的支持 🎹"
          : "InRecord｜購買成功，課程已開通 🎹",
        htmlContent: buildHtml({
          planLabel: planLabel || plan,
          planUnlock,
          merTradeNo: merTradeNo || "-",
          loginUrl,
          presale,
        }),
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok || res.status === 201) {
      return { success: true, messageId: data.messageId };
    }
    return { success: false, error: `brevo_${res.status}`, detail: data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
