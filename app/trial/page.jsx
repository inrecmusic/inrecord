import Logo from "@/components/Logo";
import { LeadForm } from "@/components/LeadCapture";
import TrialUpsell from "@/components/TrialUpsell";
import styles from "@/components/TrialUpsell.module.css";
import { verifyTrialToken, TRIAL_CONTENT_KEY } from "@/lib/trial";
import { getSupabaseAdmin } from "@/lib/supabase";
import { signBunnyEmbedUrl } from "@/lib/bunny";
import { getSaleSettings, salePhase } from "@/lib/sale";
import { trialOffer } from "@/lib/trial-offer";

// 免費試看頁（試看信裡的專屬連結落地頁）：簽章有效才播後台設定的試看影片；無效或沒帶簽章就顯示留信箱表單再寄一次。
// 影片走 Bunny 簽名 embed（3 小時到期，重新整理即重簽）；影片 ID 存 site_content.trial_video_id，後台「銷售設定」可換、免部署。
// 有影片時掛 TrialUpsell（client）：播完／看到 92%／player.js 沒上工的保底計時，彈出導購視窗。
export const metadata = { title: "免費試看｜InRecord", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

async function readTrialVideoId() {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return "";
    const { data } = await sb.from("site_content").select("body_md").eq("key", TRIAL_CONTENT_KEY).maybeSingle();
    return String(data?.body_md || "").trim();
  } catch {
    return "";
  }
}

async function readOffer() {
  try {
    const settings = await getSaleSettings();
    return settings ? trialOffer(salePhase(settings)) : { mode: "none" };
  } catch {
    return { mode: "none" };
  }
}

const page = { minHeight: "100vh", background: "#05070b", color: "#fff", fontFamily: "var(--font-noto-sans), 'PingFang TC', 'Microsoft JhengHei', sans-serif" };
const wrap = { maxWidth: 960, margin: "0 auto", padding: "28px 20px 72px" };
const eyebrow = { display: "block", fontFamily: "var(--font-jetbrains), monospace", fontSize: 12, fontWeight: 700, letterSpacing: ".22em", textTransform: "uppercase", color: "#a9c6ff" };
const h1 = { margin: "8px 0 14px", fontFamily: "var(--type-display)", fontWeight: 600, fontSize: "clamp(26px, 4vw, 38px)", lineHeight: 1.15, wordBreak: "keep-all", lineBreak: "strict" };
const p = { margin: "0 0 22px", color: "rgba(255,255,255,.75)", fontSize: 16, lineHeight: 1.75, maxWidth: 640, wordBreak: "keep-all", lineBreak: "strict" };
const videoBox = { position: "relative", paddingTop: "56.25%", background: "#000", borderRadius: 18, overflow: "hidden", border: "1px solid rgba(120,160,255,.18)", boxShadow: "0 30px 80px rgba(0,0,0,.5)" };
const card = { maxWidth: 520, margin: "40px auto 0", background: "#fff", color: "#0f172a", borderRadius: 20, padding: "32px 28px", boxShadow: "0 30px 80px rgba(0,0,0,.5)" };

export default async function TrialPage({ searchParams }) {
  const e = String(searchParams?.e || "");
  const t = String(searchParams?.t || "");
  const enabled = process.env.LEAD_CAPTURE === "on";
  const hasToken = Boolean(e || t); // 有帶參數＝從信裡點進來的（可能過期）；沒帶＝從導覽列直接進來
  const valid = enabled && verifyTrialToken(e, t);
  const [videoId, offerOrNull] = valid
    ? await Promise.all([readTrialVideoId(), readOffer()])
    : ["", null];
  const src = videoId
    ? signBunnyEmbedUrl(videoId, { libraryId: process.env.NEXT_PUBLIC_BUNNY_LIBRARY_ID, tokenKey: process.env.BUNNY_TOKEN_KEY })
    : "";
  const offer = src ? offerOrNull : null;

  return (
    <main style={page}>
      <div style={wrap}>
        <a href="/" style={{ display: "inline-block", marginBottom: 28 }}><Logo white size={28} /></a>
        {valid ? (
          <>
            <span style={eyebrow}>Free Lesson</span>
            <h1 style={h1}>免費試看課程影片</h1>
            <p className={styles.lead}>《從零開始學鋼琴》的教學實錄，跟正式課程同一套內容。</p>
            <p className={styles.note}>為了把試看控制在 5 分鐘內，這支影片有經過剪輯、部分片段也加快了；正式課程的影片是正常速度，講解更完整，細節也交代得更清楚。</p>
            {src ? (
              <div style={videoBox}>
                <iframe id="trial-player" src={src} title="免費試看課程影片" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                  allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture" allowFullScreen />
              </div>
            ) : (
              <div style={{ ...videoBox, paddingTop: 0, padding: "48px 24px", textAlign: "center", color: "#94a3b8", fontSize: 15 }}>
                試看影片準備中。上架後我們會再寄信通知你，這個連結到時候直接點開就能看。
              </div>
            )}
            <div className={styles.ctaRow}>
              <a href="/?ref=trial-page#pricing" className={styles.btnPrimary}>查看課程方案</a>
              <a href="/" className={styles.btnSecondary}>回官網首頁</a>
            </div>
            {src ? <TrialUpsell playerId="trial-player" offer={offer} /> : null}
          </>
        ) : !enabled ? (
          <div style={card}>
            <span style={{ ...eyebrow, color: "#2563eb" }}>Free Lesson</span>
            <h1 style={{ ...h1, fontSize: 24, color: "#0f172a" }}>免費試看即將開放</h1>
            <p style={{ ...p, color: "#64748b", fontSize: 15, marginBottom: 0 }}>試看影片準備中，開放後會在官網公告。</p>
          </div>
        ) : (
          <div style={card}>
            <span style={{ ...eyebrow, color: "#2563eb" }}>Free Lesson</span>
            <h1 style={{ ...h1, fontSize: 24, color: "#0f172a" }}>
              {hasToken ? "這個試看連結無效或已失效" : "免費試看《從零開始學鋼琴》"}
            </h1>
            <p style={{ ...p, color: "#64748b", fontSize: 15 }}>
              {hasToken
                ? "留下 Email，我們馬上再寄一次專屬的試看連結給你。"
                : "留下 Email，我們馬上把試看影片的專屬連結寄給你，隨時都能重看。"}
            </p>
            <LeadForm layout="stack" cta="寄試看給我" />
          </div>
        )}
      </div>
    </main>
  );
}
