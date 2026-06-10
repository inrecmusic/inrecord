// 偵測常見 App 內建瀏覽器(WebView)。Google OAuth 在這些環境會被擋下
// （錯誤 403 disallowed_useragent），需引導用戶改用 Email 驗證碼或系統瀏覽器。

// 各 App WebView 在 UserAgent 中的特徵字串
const IN_APP_SIGNATURES = [
  "FBAN", "FBAV", "FB_IAB",   // Facebook
  "Instagram",                 // Instagram
  "Line/",                     // LINE（用 Line/ 避免誤判 "online" 等字）
  "Messenger",                 // FB Messenger
  "MicroMessenger",            // WeChat
  "TikTok", "musical_ly", "BytedanceWebview", // TikTok / 抖音
  "; wv)",                     // Android WebView 通用標記
];

export function isInAppBrowser(ua) {
  const agent = ua ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  if (!agent) return false;
  return IN_APP_SIGNATURES.some((sig) => agent.includes(sig));
}
