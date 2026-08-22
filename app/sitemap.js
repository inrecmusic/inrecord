const BASE = (process.env.NEXT_PUBLIC_SITE_URL || "https://inrecordmusic.com").replace(/\/$/, "");

// 只列公開、可索引頁；/classroom /admin /login /success 等私有或無 SEO 價值頁不列（robots 亦擋 /classroom）。
export default function sitemap() {
  const now = new Date();
  return [
    { url: BASE, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/demo`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
