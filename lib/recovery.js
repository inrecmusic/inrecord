// lib/recovery.js — 未成交挽回信：純函式（候選篩選 + 信件內容）

// 未付款、落在挽回時間窗、尚未寄過、且有 email 的訂單
import { renderAdminEmailHtml } from "./newsletter.js";
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

const RECOVERY_CTA = "https://inrecordmusic.com/?utm_source=email&utm_medium=email&utm_campaign=abandoned_recovery#pricing";

// 挽回信：走電子報同一套品牌版面（深色頁首＋Logo、吉祥物、白卡片、簽名檔）。純提醒、不給折扣。
// planLabel 由 mdToHtml 跳脫（防注入）；siteUrl 供 Logo／吉祥物圖片的絕對網址。
export function buildRecoveryEmail({ planLabel, siteUrl = "https://inrecordmusic.com" } = {}) {
  const label = String(planLabel || "課程").replace(/[\r\n]+/g, " ");
  const subject = "你的 InRecord 課程訂單還沒完成 🎹";
  const bodyMd = [
    "@badge 訂單提醒",
    "@subtitle 你的課程只差一步就能開始。", "",
    `![InRecord 吉祥物](${siteUrl}/mascot-grand-v1.png|150)`, "",
    "嗨，你好：", "",
    `你先前在 InRecord 選了「${label}」，付款還沒有完成。不用重新找，回到官網選同一個方案再結帳一次就好。`, "",
    "## 完成購買後你會得到",
    "- 10 章節完整課程影片，一次買斷，營運期間持續觀看，並保證至少 3 年",
    "- 每一章搭配互動遊戲與跟練單元，邊玩邊練",
    "- 完整樂譜下載、作業繳交與老師回覆", "",
    `[回去完成購買](${RECOVERY_CTA})`, "",
    "## 還在考慮？",
    "- 課程分兩批上架：9/30 開放第一章到第五章，10/31 全數上架",
    "- 預售訂單的 7 天鑑賞期自 10/31 正式開課日起算：期間內觀看進度未超過 5%，可申請全額退費（第 8～14 日退 30%，完整級距依服務條款）",
    "- 有任何問題，直接回這封信，我們會盡快回覆", "",
    "若你已經完成購買，或不想再收到這封提醒，回信告訴我們就好。", "",
    "**InRecord・音樂刻 敬上**",
  ].join("\n");
  return { subject, html: renderAdminEmailHtml({ subject, bodyMd, siteUrl }) };
}
