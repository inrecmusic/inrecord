import HomeClient from "./HomeClient";
import { getSaleSettings, salePhase } from "@/lib/sale";
import { isFanProofOpen } from "@/lib/fan-proof";
import { getSupabaseAdmin } from "@/lib/supabase";
import { readTermsVersion } from "@/lib/terms-version";
import { getSiteStats } from "@/lib/site-stats";

export const revalidate = 60;

export default async function Page() {
  const now = new Date();
  const settings = await getSaleSettings();
  const db = getSupabaseAdmin();
  const termsVersion = await readTermsVersion(db);
  // 社會證明數字伺服端先算好（隨頁面 60s revalidate 快取）：省掉每位訪客一次 /api/stats 與 2 個 DB 查詢，
  // hero 的「已有 N 位學員」首屏就在、不會後到造成版位跳動。拿不到（DB 未設／查詢失敗）給 null，HomeClient 退回前端 fetch。
  const initialStats = db ? await getSiteStats(db).catch(() => null) : null;
  const leadCapture = process.env.LEAD_CAPTURE === "on"; // 留信箱換免費試看（fail-safe：未設＝關，首頁顯示原本的 CTA 卡片、不彈窗） // 購買視窗第二步顯示的條款版本（寫單時後端會再讀一次）
  const phase = salePhase(settings, now);

  const sale = {
    state: phase.state,
    onSale: phase.onSale,
    classroomOpen: phase.classroomOpen,
    salesStartAt: phase.salesStartAt,
    nextIncreaseAt: phase.nextIncreaseAt,
    plans: phase.plans,
    fanPlan: phase.fanPlan,
    openAt: settings?.open_at || null,
    // 伺服器端算好「粉絲憑證是否開放」：避免在 client render 用 Date.now() 造成 hydration 不一致
    fanProofOpen: isFanProofOpen(now.getTime(), phase.fanPlan?.deadlineMs),
  };

  // 開課通知 lazy trigger（免費方案無 sub-daily cron）：開課後首位訪客觸發，CAS 去重。
  if (phase.classroomOpen && settings && !settings.launch_notified_at) {
    const site = process.env.NEXT_PUBLIC_SITE_URL || "https://inrecordmusic.com";
    const secret = process.env.CRON_SECRET;
    if (secret) {
      fetch(`${site}/api/cron/sale-launch-notify`, { headers: { Authorization: `Bearer ${secret}` } }).catch(() => {});
    }
  }

  // schema.org Course 結構化資料（SEO：Google 課程 rich results）
  const courseLd = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: "從零開始學鋼琴 — 流行鋼琴零基礎入門課",
    description:
      "10 章節系統化課程，從認識鍵盤、音名到 24 個三和弦與兩種基礎伴奏，搭配互動遊戲練習，零基礎也能彈出喜歡的流行歌曲。",
    inLanguage: "zh-Hant",
    provider: { "@type": "Organization", name: "InRecord", url: "https://inrecordmusic.com" },
    instructor: {
      "@type": "Person",
      name: "張育瑞 Rick Chang",
      description: "美國伯克利音樂學院演奏與音樂製作碩士、跨界鋼琴家",
    },
    offers: {
      "@type": "Offer",
      category: "Paid",
      price: sale.fanPlan?.directPrice ?? sale.plans?.bundle?.price ?? 3999,
      priceCurrency: "TWD",
      url: "https://inrecordmusic.com",
    },
    hasCourseInstance: { "@type": "CourseInstance", courseMode: "Online", courseWorkload: "PT6H" },
  };

  // schema.org Organization（品牌／Google knowledge graph）
  const orgLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "InRecord",
    url: "https://inrecordmusic.com",
    logo: "https://inrecordmusic.com/logo-512.png", // 縮到 512² 的版本（原檔 1254²／740KB 爬蟲抓太重）
    sameAs: ["https://www.instagram.com/inrecord.music"],
  };

  return (
    <>
      {/* 桌機 LCP 元素是 .heroPhoto 的 CSS 背景圖，瀏覽器要等 CSS 解析完才發現它 → 預載讓它與 HTML 同時起跑（Next 會提升到 <head>） */}
      <link rel="preload" as="image" href="/hero-pianist.webp" fetchPriority="high" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([courseLd, orgLd]).replace(/</g, "\\u003c") }} />
      <HomeClient sale={sale} termsVersion={termsVersion} leadCapture={leadCapture} initialStats={initialStats} />
    </>
  );
}
