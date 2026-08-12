import crypto from "crypto";

// 付款成功頁「確認開通 email」的簽章憑證。
//
// 背景（修 IDOR）：舊版 API 只憑 MerTradeNo 就能更新 orders.grant_email——攻擊者
// 知道/枚舉交易號即可把別人訂單的課程開通到自己 email。學員付款後多半未登入，
// 不能用登入驗證，故改由 /success server component 用 HMAC 簽出一次性 token
// （只證明「知道這筆訂單的伺服器端運算結果」），前端呼叫 API 時一併帶上。
//
// SECRET 用既有 server-only env SUPABASE_SERVICE_ROLE_KEY（絕不流向前端，
// 用途與 PAYUNI_HASH_KEY 等其他伺服器端簽章 secret 相同性質）。
function secret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

export function signGrantToken(merTradeNo) {
  return crypto.createHmac("sha256", secret()).update(String(merTradeNo)).digest("hex");
}

// timingSafeEqual 要求等長 buffer；長度不等時直接短路，不進去比對。
export function verifyGrantToken(merTradeNo, token) {
  if (!token || typeof token !== "string") return false;
  const expected = signGrantToken(merTradeNo);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(token, "hex");
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
