// lib/recovery.js — 未成交挽回信：純函式（候選篩選 + 信件內容）

// 未付款、落在挽回時間窗、尚未寄過、且有 email 的訂單。
// recentEmails：近 7 天已寄過挽回信的 email——同一 email 7 天內只寄一次，否則被灌單的信箱
// （checkout 不驗登入，任何人都能替別人建 pending 單）每天都會收到挽回信；同一批候選裡同 email 也只留第一筆。
import { renderAdminEmailHtml } from "./newsletter.js";
export const RECOVERY_COOLDOWN_DAYS = 7;
const normEmail = (e) => String(e || "").trim().toLowerCase();
export function selectRecoveryCandidates(orders, now = new Date(), { minHours = 6, maxHours = 48, recentEmails = [] } = {}) {
  const t = now.getTime();
  const minMs = minHours * 3600 * 1000;
  const maxMs = maxHours * 3600 * 1000;
  const seen = new Set([...recentEmails].map(normEmail));
  return (orders || []).filter((o) => {
    if (!o || o.status !== "pending" || o.recovery_sent_at || !o.email) return false;
    const created = new Date(o.created_at).getTime();
    if (!Number.isFinite(created)) return false;
    const age = t - created;
    if (age < minMs || age > maxMs) return false;
    const key = normEmail(o.email);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const RECOVERY_CTA = "https://inrecordmusic.com/?utm_source=email&utm_medium=email&utm_campaign=abandoned_recovery#pricing";

// 挽回信：走電子報同一套品牌版面（深色頁首＋Logo、吉祥物、白卡片、簽名檔）。純提醒、不給折扣。
// planLabel 由 mdToHtml 跳脫（防注入）；siteUrl 供 Logo／吉祥物圖片的絕對網址。
export function buildRecoveryEmail({ planLabel, siteUrl = "https://inrecordmusic.com" } = {}) {
  const label = String(planLabel || "課程").replace(/[\r\n]+/g, " ");
  const subject = "您的課程訂單尚未完成付款";
  const bodyMd = [
    "@badge 訂單提醒",
    "@subtitle 只差付款這一步，課程就能開始。", "",
    "親愛的學員您好，", "",
    `您先前在 InRecord 選了「${label}」，付款還沒有完成。不需要重新挑選，回到官網選同一個方案再結帳一次即可。`, "",
    `[完成付款](${RECOVERY_CTA})`, "",
    `![InRecord 吉祥物](${siteUrl}/mascot-grand-v1.png|220)`, "",
    "## 完成購買後您會得到",
    "- 10 章節完整課程影片，一次買斷，營運期間持續觀看，並保證至少 3 年",
    "- 每一章搭配互動遊戲與跟練單元，邊玩邊練",
    "- 完整樂譜下載、作業繳交與老師回覆", "",
    "## 上架時程",
    ":::timeline",
    "9/30 | 第 1 至第 3 章　開放",
    "10/31 | 全部章節上架完成 | 正式開課日",
    ":::", "",
    "## 退費說明",
    "預售訂單的 7 天鑑賞期自 10/31 正式開課日起算：期間內觀看進度未超過 5%，可申請全額退費（第 8～14 日退 30%，完整級距依服務條款）。", "",
    "若您已經完成購買，或不想再收到這封提醒，回信告訴我們就好。有任何問題也歡迎直接回覆這封信。", "",
    `[完成付款](${RECOVERY_CTA})`,
  ].join("\n");
  return { subject, html: renderAdminEmailHtml({ subject, bodyMd, siteUrl }) };
}
