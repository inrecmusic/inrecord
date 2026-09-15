import crypto from "crypto";

// 付款成功頁「確認開通 email」的兩張憑證。
//
// 背景（第一版修 IDOR）：舊版 API 只憑 MerTradeNo 就能更新 orders.grant_email——攻擊者
// 知道/枚舉交易號即可把別人訂單的課程開通到自己 email。學員付款後多半未登入，
// 不能用登入驗證，故改由 /success 用 HMAC 簽出 token，前端呼叫 API 時一併帶上。
//
// 背景（第二版，2026-09-15）：上一版只是把秘密從「MerTradeNo」換成「HMAC(MerTradeNo)」——
// 只要開得了 /success 就拿得到那個 HMAC，而 MerTradeNo 是 INREC+毫秒時間戳、可預測，
// 又會出現在網址列／瀏覽紀錄／截圖／第三方像素。等價於沒防。這版改成兩道：
//   ① returnCookie：由 /api/payuni/return 在**驗過 PAYUNi 簽章之後**種下的 HttpOnly cookie，
//      證明「這個瀏覽器真的是從 PAYUNi 付款完成導回來的」。單看網址拿不到。
//   ② grantToken：/success 只有在 ① 驗過時才簽出來，且本身帶到期時間。
// 兩者都以 `${exp}.${hmac}` 格式帶到期，逾時一律失效。
//
// SECRET 用既有 server-only env SUPABASE_SERVICE_ROLE_KEY（絕不流向前端，
// 用途與 PAYUNI_HASH_KEY 等其他伺服器端簽章 secret 相同性質）。
function secret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

export const RETURN_COOKIE = "inrec_pu";
export const RETURN_TTL_MS = 30 * 60 * 1000; // 導回後 30 分鐘內可設定開通信箱
export const GRANT_TTL_MS = 30 * 60 * 1000;

// scope 讓兩種憑證的簽章互不通用（拿 cookie 當 grantToken 用也過不了）
function sign(scope, merTradeNo, expMs) {
  const exp = Math.floor(expMs);
  const mac = crypto.createHmac("sha256", secret()).update(`${scope}.${merTradeNo}.${exp}`).digest("hex");
  return `${exp}.${mac}`;
}

function verify(scope, merTradeNo, value, nowMs) {
  if (!value || typeof value !== "string") return false;
  const dot = value.indexOf(".");
  if (dot <= 0) return false;
  const exp = Number(value.slice(0, dot));
  if (!Number.isFinite(exp) || exp <= nowMs) return false; // 過期
  const expected = sign(scope, merTradeNo, exp);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(value, "utf8");
  // timingSafeEqual 要求等長 buffer；長度不等時直接短路，不進去比對。
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ① PAYUNi 導回憑證（HttpOnly cookie 的值）
export function signReturnCookie(merTradeNo, nowMs = Date.now()) {
  return sign("return", merTradeNo, nowMs + RETURN_TTL_MS);
}
export function verifyReturnCookie(merTradeNo, value, nowMs = Date.now()) {
  return verify("return", merTradeNo, value, nowMs);
}

// ② 開通信箱表單憑證
export function signGrantToken(merTradeNo, nowMs = Date.now()) {
  return sign("grant", merTradeNo, nowMs + GRANT_TTL_MS);
}
export function verifyGrantToken(merTradeNo, token, nowMs = Date.now()) {
  return verify("grant", merTradeNo, token, nowMs);
}
