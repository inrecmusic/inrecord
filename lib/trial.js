// lib/trial.js — 免費試看：Email 專屬簽章連結（HMAC，與退訂簽章不同 scope）、試看信內容、後台試看影片 ID 驗證。
// 流程：首頁留信箱 → 進 Brevo 名單 → 寄這封信 → /trial?e=&t= 驗簽章後播「後台設定的試看影片」。
import crypto from "crypto";
import { normalizeEmail } from "./unsubscribe.js";
import { renderNewsletterHtml } from "./newsletter.js";
import { buildUnsubscribeUrl } from "./unsubscribe.js";

export const TRIAL_CONTENT_KEY = "trial_video_id"; // site_content 的 key：後台「銷售設定」填 Bunny 影片 ID
const secret = () => process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export function signTrialToken(email) {
  return crypto.createHmac("sha256", secret()).update("trial:" + normalizeEmail(email)).digest("hex");
}

export function verifyTrialToken(email, token) {
  if (!token || typeof token !== "string" || !normalizeEmail(email).includes("@")) return false;
  const a = Buffer.from(signTrialToken(email), "hex");
  const b = Buffer.from(token, "hex");
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function buildTrialUrl(email, siteUrl = "https://inrecordmusic.com") {
  const e = normalizeEmail(email);
  return `${siteUrl}/trial?e=${encodeURIComponent(e)}&t=${signTrialToken(e)}`;
}

// 試看信：走電子報同一套品牌版面，並附一鍵退訂。
// ⚠️ 這是行銷信（收件人尚未購買），Gmail／Yahoo 的大量寄件者規範要求必須提供一鍵退訂；
// 缺了會被降權進促銷或垃圾信，而且會連累同一個寄件信箱的開課通知信與購課信。
// 收信理由句寫明是「你在官網索取免費試看」，不要用電子報預設的「你是學員」。
export function buildTrialEmail({ email, siteUrl = "https://inrecordmusic.com" }) {
  const url = buildTrialUrl(email, siteUrl);
  const subject = "InRecord｜你的免費試看課程影片來了 🎹";
  const bodyMd = [
    "@badge 免費試看",
    "@subtitle 先看免費試看課程影片，再決定。", "",
    `![InRecord 吉祥物](${siteUrl}/mascot-grand-v1.png|110)`, "",
    "你好：", "",
    "謝謝你留下 Email。這是《從零開始學鋼琴－了解三和弦與基礎伴奏》的免費試看課程影片，點下面的按鈕就能看：", "",
    `[觀看免費試看課程影片](${url})`, "",
    "這個連結是你專屬的，之後想再看，點同一個連結就好。", "",
    "看完如果想開始學，官網上有目前的方案與優惠；有任何問題，直接回這封信告訴我們。", "",
    "**InRecord・音樂刻 敬上**",
  ].join("\n");
  const unsubscribeUrl = buildUnsubscribeUrl(email, siteUrl);
  const html = renderNewsletterHtml({
    subject, bodyMd, siteUrl, unsubscribeUrl,
    reasonLine: "你收到這封信，是因為你在 InRecord 官網索取免費試看。",
  });
  return { subject, html, unsubscribeUrl };
}

// Bunny 影片 ID 是 GUID；放寬到英數／底線／連字號、最長 64，空字串＝清除。擋掉引號、空白等注入字元。
export function isValidBunnyVideoId(id) {
  return /^[\w-]{0,64}$/.test(String(id ?? ""));
}
