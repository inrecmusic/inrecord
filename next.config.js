/** @type {import('next').NextConfig} */

// 全站安全標頭（HSTS 由 Vercel 提供，這裡不重複）
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 僅關閉確定用不到的功能；microphone 不關，保留唱名/音感類互動可能用途
  { key: "Permissions-Policy", value: "camera=(), geolocation=()" },
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
    ];
  },
};

module.exports = nextConfig;
