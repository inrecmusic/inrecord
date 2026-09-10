import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import MarkdownContent from "@/components/MarkdownContent";
import { DEFAULT_TERMS_MD } from "@/lib/legal-docs";

// canonical 要各自宣告：root layout 的 canonical 是 "/"，子頁不覆寫就會全部自稱首頁副本，
// sitemap 送去索引也不會被收錄。description 同理，不覆寫就會沿用首頁那句。
export const metadata = {
  title: "服務條款 | InRecord",
  description: "InRecord 線上鋼琴課程的服務條款：課程存取與授權範圍、購買付款、退費政策、智慧財產權與使用規範。",
  alternates: { canonical: "/terms" },
};
export const revalidate = 300;


// 服務條款單一來源：後台存過（site_content）顯示 DB 版，沒存過用 lib/legal-docs 的共用預設 —— 
// 後台編輯器吃的是同一份，所以前台與後台永遠一致（見 lib/legal-docs.js）。
async function getOverride(key) {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return null;
    const { data } = await sb.from("site_content").select("body_md").eq("key", key).maybeSingle();
    return data?.body_md?.trim() || null;
  } catch { return null; }
}

export default async function TermsPage() {
  const md = (await getOverride("terms")) || DEFAULT_TERMS_MD;
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: "40px 20px 80px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        {/* back */}
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#64748b", textDecoration: "none", marginBottom: 28, fontWeight: 700 }}>
          ← 返回首頁
        </Link>

        <div className="content-card" style={{ background: "#fff", borderRadius: 20, boxShadow: "0 2px 24px rgba(15,23,42,.07)" }}>
          <MarkdownContent md={md} />
        </div>

        <p style={{ textAlign: "center", marginTop: 24, fontSize: 13, color: "#94a3b8" }}>
          © InRecord｜音樂刻 ·{" "}
          <Link href="/privacy" style={{ color: "#64748b" }}>隱私權政策</Link>
        </p>
      </div>
    </div>
  );
}
