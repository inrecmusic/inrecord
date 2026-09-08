import Logo from "@/components/Logo";
import { LeadForm } from "@/components/LeadCapture";
import { verifyTrialToken, TRIAL_CONTENT_KEY } from "@/lib/trial";
import { getSupabaseAdmin } from "@/lib/supabase";
import { signBunnyEmbedUrl } from "@/lib/bunny";

// 免費試看頁（試看信裡的專屬連結落地頁）：簽章有效才播後台設定的試看影片；無效或沒帶簽章就顯示留信箱表單再寄一次。
// 影片走 Bunny 簽名 embed（3 小時到期，重新整理即重簽）；影片 ID 存 site_content.trial_video_id，後台「銷售設定」可換、免部署。
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

const page = { minHeight: "100vh", background: "#0b1220", color: "#fff", fontFamily: "var(--font-noto-sans), 'PingFang TC', 'Microsoft JhengHei', sans-serif" };
const wrap = { maxWidth: 960, margin: "0 auto", padding: "28px 20px 64px" };
const eyebrow = { fontFamily: "var(--font-jetbrains), monospace", fontSize: 12, fontWeight: 700, letterSpacing: ".22em", textTransform: "uppercase", color: "#a9c6ff" };
const h1 = { margin: "8px 0 8px", fontFamily: "var(--type-display)", fontWeight: 600, fontSize: "clamp(26px, 4vw, 38px)", lineHeight: 1.15, wordBreak: "keep-all", lineBreak: "strict" };
const p = { margin: "0 0 22px", color: "rgba(255,255,255,.75)", fontSize: 16, lineHeight: 1.75, maxWidth: 640, wordBreak: "keep-all", lineBreak: "strict" };
const videoBox = { position: "relative", paddingTop: "56.25%", background: "#000", borderRadius: 18, overflow: "hidden", border: "1px solid rgba(120,160,255,.18)", boxShadow: "0 30px 80px rgba(0,0,0,.5)" };
const cta = { display: "inline-block", padding: "14px 32px", background: "#2563eb", color: "#fff", borderRadius: 10, fontWeight: 700, fontSize: 16, textDecoration: "none" };
const card = { maxWidth: 520, margin: "40px auto 0", background: "#fff", color: "#0f172a", borderRadius: 20, padding: "32px 28px", boxShadow: "0 30px 80px rgba(0,0,0,.5)" };

export default async function TrialPage({ searchParams }) {
  const e = String(searchParams?.e || "");
  const t = String(searchParams?.t || "");
  const enabled = process.env.LEAD_CAPTURE === "on";
  const valid = enabled && verifyTrialToken(e, t);
  const videoId = valid ? await readTrialVideoId() : "";
  const src = videoId
    ? signBunnyEmbedUrl(videoId, { libraryId: process.env.NEXT_PUBLIC_BUNNY_LIBRARY_ID, tokenKey: process.env.BUNNY_TOKEN_KEY })
    : "";

  return (
    <main style={page}>
      <div style={wrap}>
        <a href="/" style={{ display: "inline-block", marginBottom: 28 }}><Logo white size={28} /></a>
        {valid ? (
          <>
            <span style={eyebrow}>Free Lesson</span>
            <h1 style={h1}>免費試看課程影片</h1>
            <p style={p}>《從零開始學鋼琴》的教學實錄，跟正式課程同一套內容。看完如果想開始學，下面有目前的方案與優惠。</p>
            {src ? (
              <div style={videoBox}>
                <iframe src={src} title="免費試看課程影片" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                  allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture" allowFullScreen />
              </div>
            ) : (
              <div style={{ ...videoBox, paddingTop: 0, padding: "48px 24px", textAlign: "center", color: "#94a3b8", fontSize: 15 }}>
                試看影片準備中。上架後我們會再寄信通知你，這個連結到時候直接點開就能看。
              </div>
            )}
            <div style={{ marginTop: 32, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
              <a href="/#pricing" style={cta}>查看課程方案</a>
              <a href="/" style={{ color: "#94a3b8", fontSize: 14, textDecoration: "none" }}>回官網首頁</a>
            </div>
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
            <h1 style={{ ...h1, fontSize: 24, color: "#0f172a" }}>這個試看連結無效或已失效</h1>
            <p style={{ ...p, color: "#64748b", fontSize: 15 }}>留下 Email，我們馬上再寄一次專屬的試看連結給你。</p>
            <LeadForm layout="stack" cta="寄試看給我" />
          </div>
        )}
      </div>
    </main>
  );
}
