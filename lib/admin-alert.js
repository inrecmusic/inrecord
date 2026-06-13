// 管理員告警信：開票／寄信失敗時通知 ADMIN_EMAIL。
// buildAdminAlertHtml 為純函式（可測）；sendAdminAlert 走 Brevo，失敗不丟例外。

const KIND_LABEL = {
  invoice: "發票開立",
  email:   "開課信寄送",
};

// HTML 跳脫：買家 email / 失敗原因等值可能含使用者輸入，未跳脫會在管理員信箱造成
// HTML 注入（釣魚連結／內容偽冒）。一律跳脫並限長以界定濫用面。
function esc(s, max = 200) {
  return String(s ?? "")
    .slice(0, max)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildAdminAlertHtml({ kind, order = {}, reason = "" }) {
  const label = KIND_LABEL[kind] || "訂單處理";
  const merTradeNo = order.mer_trade_no || "-";
  const email = order.email || "-";
  // 主旨非 HTML，不需跳脫，但仍限長避免被塞超長字串
  const subject = `[InRecord] ${label}失敗 — 訂單 ${String(merTradeNo).slice(0, 100)}`;
  const html = `<!doctype html><html lang="zh-Hant"><body style="font-family:-apple-system,Arial,'PingFang TC',sans-serif;color:#0f172a;">
  <h2 style="color:#b91c1c;">⚠️ ${esc(label)}失敗</h2>
  <table style="border-collapse:collapse;font-size:14px;">
    <tr><td style="padding:4px 16px 4px 0;color:#64748b;">訂單編號</td><td><b>${esc(merTradeNo)}</b></td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#64748b;">買家 Email</td><td>${esc(email)}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#64748b;">失敗類型</td><td>${esc(label)}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#64748b;">失敗原因</td><td>${esc(reason || "未知")}</td></tr>
  </table>
  <p style="font-size:14px;color:#334155;">請登入後台「訂單管理 → 待處理告警」面板處理（補開發票 / 補寄開課信）。</p>
  </body></html>`;
  return { subject, html };
}

export async function sendAdminAlert({ subject, html }) {
  const apiKey     = process.env.BREVO_API_KEY;
  const sender     = process.env.BREVO_SENDER_EMAIL;
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!apiKey || !sender || !adminEmail) return { success: false, skipped: true };

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({
        sender: { email: sender, name: process.env.BREVO_SENDER_NAME || "InRecord" },
        replyTo: { email: process.env.BREVO_REPLY_TO || "service@inrecordmusic.com", name: "InRecord 客服" },
        to: [{ email: adminEmail }],
        subject,
        htmlContent: html,
      }),
    });
    if (res.ok) return { success: true };
    return { success: false, error: `brevo_${res.status}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
