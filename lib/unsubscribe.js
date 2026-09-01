import crypto from "crypto";

// lib/unsubscribe.js — 電子報退訂。
// 每封群發信帶「該 email 專屬」的簽章連結（HMAC-SHA256；secret 與 grant-token 同用 server-only 的
// SUPABASE_SERVICE_ROLE_KEY），點連結 → /unsubscribe 頁按「確認取消訂閱」→ POST /api/newsletter/unsubscribe
// 寫入 newsletter_unsubscribes；群發撈名單時排除。只擋電子報，登入驗證碼／購課／開通信不受影響。
// 不直接在 GET 就退訂：Gmail/Outlook 的連結預抓會把人誤退訂。
const TABLE = "newsletter_unsubscribes";

export function normalizeEmail(e) {
  return String(e ?? "").trim().toLowerCase();
}

function secret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

export function signUnsubscribeToken(email) {
  return crypto.createHmac("sha256", secret()).update("unsub:" + normalizeEmail(email)).digest("hex");
}

// timingSafeEqual 要求等長 buffer；長度不等直接短路
export function verifyUnsubscribeToken(email, token) {
  if (!token || typeof token !== "string" || !normalizeEmail(email).includes("@")) return false;
  const a = Buffer.from(signUnsubscribeToken(email), "hex");
  const b = Buffer.from(token, "hex");
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function buildUnsubscribeUrl(email, siteUrl = "https://inrecordmusic.com") {
  const e = normalizeEmail(email);
  return `${siteUrl}/unsubscribe?e=${encodeURIComponent(e)}&t=${signUnsubscribeToken(e)}`;
}

// 寫入退訂（冪等：已在名單就略過）
export async function recordUnsubscribe(supabase, email, source = "link") {
  const e = normalizeEmail(email);
  const { error } = await supabase.from(TABLE).upsert({ email: e, source }, { onConflict: "email", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  return e;
}

// 從名單濾掉已退訂者。表不存在／查詢失敗 → fail-open（記 log、照原名單寄），
// 避免 SQL 尚未跑到正式 DB 時把整個群發擋死。
export async function excludeUnsubscribed(supabase, emails) {
  if (!Array.isArray(emails) || emails.length === 0) return emails || [];
  try {
    const { data, error } = await supabase.from(TABLE).select("email");
    if (error) throw new Error(error.message);
    const set = new Set((data || []).map((r) => normalizeEmail(r.email)));
    return emails.filter((e) => !set.has(normalizeEmail(e)));
  } catch (e) {
    console.error("[unsubscribe] 讀取退訂名單失敗（fail-open，不排除）:", e?.message || e);
    return emails;
  }
}
