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
};

module.exports = nextConfig;
