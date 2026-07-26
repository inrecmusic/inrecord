// lib/recovery.js — 未成交挽回信：純函式（候選篩選 + 信件內容）

// 未付款、落在挽回時間窗、尚未寄過、且有 email 的訂單
export function selectRecoveryCandidates(orders, now = new Date(), { minHours = 6, maxHours = 48 } = {}) {
  const t = now.getTime();
  const minMs = minHours * 3600 * 1000;
  const maxMs = maxHours * 3600 * 1000;
  return (orders || []).filter((o) => {
    if (!o || o.status !== "pending" || o.recovery_sent_at || !o.email) return false;
    const created = new Date(o.created_at).getTime();
    if (!Number.isFinite(created)) return false;
    const age = t - created;
    return age >= minMs && age <= maxMs;
  });
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

const RECOVERY_CTA = "https://inrecordmusic.com/?utm_source=email&utm_medium=email&utm_campaign=abandoned_recovery#pricing";

export function buildRecoveryEmail({ planLabel } = {}) {
  const label = escapeHtml(planLabel || "課程");
  const subject = "你的 InRecord 課程訂單還沒完成 🎹";
  const html = `<div style="font-family:-apple-system,'Noto Sans TC',sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
  <h2 style="font-size:20px">訂單還沒完成 🎹</h2>
  <p>嗨，你先前選了「<strong>${label}</strong>」但還沒完成付款。名額有限，別錯過～</p>
  <p style="text-align:center;margin:28px 0">
    <a href="${RECOVERY_CTA}" style="display:inline-block;background:#2563eb;color:#fff;font-weight:700;padding:12px 28px;border-radius:10px;text-decoration:none">回去完成購買</a>
  </p>
  <p style="color:#64748b;font-size:13px">有任何問題歡迎回信或聯絡客服 service@inrecordmusic.com。若你已完成購買、或不想再收到此提醒，回信告訴我們即可。</p>
</div>`;
  return { subject, html };
}
