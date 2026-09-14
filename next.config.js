/** @type {import('next').NextConfig} */

// 全站安全標頭（HSTS 由 Vercel 提供，這裡不重複）
// CSP（enforcing）：2026-08-22 以 Report-Only 巡查首頁/教室/播放頁皆零違規後，轉為正式阻擋。
// 放行：Bunny 影片播放器＋player.js、Vimeo legacy、Supabase(含 realtime wss)、PAYUNi 金流、
// 追蹤碼中心可能載入的 GTM/FB/Google/PostHog、Unsplash 圖。inline 因大量 inline style／Next 內聯腳本而保留。
// 2026-09-14：補齊 GA4／Google Ads／LINE Tag 實際會打的網域（script 由 gtm 再載 googleads／googleadservices／LINE lt.js，
// 上報打 google-analytics／analytics.google.com／google.com(.tw)／doubleclick／tr.line.me）。缺這些時後台一啟用就靜默失效：
// 頁面不報錯、後台顯示已啟用、但一筆轉換都送不出去。
// /demo 體驗頁（public/demo/index.html）：Google Fonts＋unpkg 的 smplr（ESM）＋音色檔 smpldsnds.github.io，
// 2026-09-02 封測發現被 CSP 擋到沒聲音，故一併放行（本站 CSP 已含 unsafe-inline/eval，加這幾個 host 不改變防護等級）。
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "object-src 'none'",
  // ⚠️ PAYUNi 正式/測試皆為 *.payuni.com.tw；form-action 漏放行會讓付款表單被 CSP 擋在「處理中」。
  "form-action 'self' https://*.payuni.com.tw",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://assets.mediadelivery.net https://www.googletagmanager.com https://connect.facebook.net https://us.i.posthog.com https://tools.google.com https://unpkg.com https://accounts.google.com https://googleads.g.doubleclick.net https://www.googleadservices.com https://d.line-scdn.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "frame-src 'self' https://iframe.mediadelivery.net https://player.vimeo.com https://*.vimeo.com https://*.payuni.com.tw https://www.instagram.com https://accounts.google.com https://td.doubleclick.net",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://us.i.posthog.com https://*.payuni.com.tw https://www.googletagmanager.com https://unpkg.com https://smpldsnds.github.io https://accounts.google.com https://*.google-analytics.com https://analytics.google.com https://www.google.com https://www.google.com.tw https://*.googleadservices.com https://*.doubleclick.net https://tr.line.me",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 僅關閉確定用不到的功能；microphone 不關，保留唱名/音感類互動可能用途
  { key: "Permissions-Policy", value: "camera=(), geolocation=()" },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" }
    ]
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // /demo 為純靜態頁（public/demo/index.html）。Next dev 不會把 bare /demo 對應到
  // 該檔（只有 /demo/index.html 會中），正式站靠 vercel.json cleanUrls 才會通；
  // 這條 rewrite 讓本機與正式站一致：/demo 內部導向靜態檔。
  async rewrites() {
    return [
      { source: "/demo", destination: "/demo/index.html" },
      // App Router 只產生 /icon.png；直接打 /favicon.ico 的工具（Slack／LINE 預覽、SEO 爬蟲）會拿到 404 HTML
      { source: "/favicon.ico", destination: "/icon.png" },
    ];
  },
};

module.exports = nextConfig;
