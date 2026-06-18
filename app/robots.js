const BASE = (process.env.NEXT_PUBLIC_SITE_URL || "https://inrecordmusic.com").replace(/\/$/, "");

export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // 私有/受保護區不需被索引
        disallow: ["/admin", "/api/", "/classroom"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
