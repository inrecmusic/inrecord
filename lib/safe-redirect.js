// lib/safe-redirect.js — 把外部傳入的 next 參數限制為站內相對路徑，避免 open redirect。
// 只放行單一前導 "/" 的相對路徑；擋掉 //evil.com、http(s)://、javascript:、/\evil.com 等。
export function safeNextPath(next, fallback = "/classroom") {
  if (typeof next !== "string" || !next) return fallback;
  if (!next.startsWith("/")) return fallback;   // 必須相對路徑
  if (next.startsWith("//")) return fallback;    // protocol-relative
  if (next.startsWith("/\\")) return fallback;   // 反斜線變體（部分瀏覽器當 //）
  if (next.includes("://")) return fallback;     // 夾帶協定（雙保險）
  return next;
}
