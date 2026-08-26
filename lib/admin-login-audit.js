// 後台登入稽核＋異常登入警示。
// 原本只稽核「後台操作」，但登入本身沒記錄——密碼若外洩，無從得知誰在何時從哪登入。
// 此模組：①每次登入（成功/失敗）落地 admin_audit_log ②成功且來自「沒見過的 IP」時寄信通知。
// 全程 fail-open：任何記錄/寄信失敗都不得中斷登入本身。
import { logAudit } from "./audit.js";
import { sendAdminAlert } from "./admin-alert.js";
import { clientIp } from "./rate-limit.js";

// HTML 跳脫：IP／User-Agent 來自請求標頭（攻擊者可控），未跳脫會在管理員信箱造成 HTML 注入。
function esc(s, max = 200) {
  return String(s ?? "")
    .slice(0, max)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const METHOD_LABEL = { password: "帳號密碼", google: "Google 登入" };

// 純函式（可測）：組出「新裝置/新 IP 登入」警示信
export function buildLoginAlertHtml({ ip, ua, method, whenLabel }) {
  const subject = "[InRecord] 後台從新的位置登入";
  const html = `<!doctype html><html lang="zh-Hant"><body style="font-family:-apple-system,Arial,'PingFang TC',sans-serif;color:#0f172a;">
  <h2 style="color:#b45309;">⚠️ 後台從新的位置登入</h2>
  <p style="font-size:14px;color:#334155;">偵測到你的 InRecord 後台從先前未使用過的 IP 登入成功。</p>
  <table style="border-collapse:collapse;font-size:14px;">
    <tr><td style="padding:4px 16px 4px 0;color:#64748b;">時間</td><td><b>${esc(whenLabel)}</b></td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#64748b;">IP 位址</td><td><b>${esc(ip || "未知")}</b></td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#64748b;">登入方式</td><td>${esc(METHOD_LABEL[method] || method)}</td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#64748b;">瀏覽器</td><td>${esc(ua, 300)}</td></tr>
  </table>
  <p style="font-size:14px;color:#334155;margin-top:16px;">
    <b>若這是你本人</b>（換網路、用手機、出門在外），可忽略此信。<br>
    <b>若不是你</b>：請立即到 Vercel 更換 <code>ADMIN_PASSWORD</code> 並重新部署，然後到後台「稽核記錄」查看該 IP 做過哪些操作。
  </p>
  </body></html>`;
  return { subject, html };
}

// 記錄一次後台登入；成功且為新 IP 時寄警示信。任何錯誤都吞掉（不影響登入）。
export async function auditAdminLogin(supabase, { actor, method, req, success }) {
  try {
    if (!supabase) return;
    const ip = clientIp(req);
    const ua = req?.headers?.get?.("user-agent") || null;

    await logAudit(supabase, {
      actor: actor || null,
      action: success ? "admin.login" : "admin.login_failed",
      targetType: "admin",
      targetId: method,
      meta: { method, ua: ua ? String(ua).slice(0, 300) : null },
      req,
    });
    if (!success || !ip) return;

    // 這個 IP 先前是否成功登入過？沒有＝新位置，寄信通知。
    // 只查 1 筆、且排除剛寫入的這筆（用 lt(created_at) 不可靠，改以 ip 比對既有成功紀錄數）。
    const { data: seen, error } = await supabase
      .from("admin_audit_log")
      .select("id")
      .eq("action", "admin.login")
      .eq("ip", ip)
      .limit(2);
    if (error) return;
    // 剛才那筆自己也會被查到，故 >1 才算「以前來過」
    if ((seen?.length || 0) > 1) return;

    const whenLabel = new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
    const { subject, html } = buildLoginAlertHtml({ ip, ua, method, whenLabel });
    await sendAdminAlert({ subject, html });
  } catch (e) {
    console.error("[admin-login-audit] 記錄/通知失敗（不影響登入）", e?.message || e);
  }
}
