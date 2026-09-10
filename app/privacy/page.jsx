import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import MarkdownContent from "@/components/MarkdownContent";
import { DEFAULT_PRIVACY_MD } from "@/lib/legal-docs";

// canonical 要各自宣告：root layout 的 canonical 是 "/"，子頁不覆寫就會全部自稱首頁副本，
// sitemap 送去索引也不會被收錄。description 同理，不覆寫就會沿用首頁那句。
export const metadata = {
  title: "隱私權政策 | InRecord",
  description: "InRecord 如何蒐集、使用與保護你的個人資料：蒐集項目、使用目的、第三方服務、Cookie 與廣告追蹤，以及你可以行使的權利。",
  alternates: { canonical: "/privacy" },
};
export const revalidate = 300;

// 隱私權政策單一來源：後台存過（site_content）顯示 DB 版，沒存過用 lib/legal-docs 的共用預設 —— 
// 後台編輯器吃的是同一份，所以前台與後台永遠一致（見 lib/legal-docs.js）。
async function getOverride(key) {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return null;
    const { data } = await sb.from("site_content").select("body_md").eq("key", key).maybeSingle();
    return data?.body_md?.trim() || null;
  } catch { return null; }
}

export default async function PrivacyPage() {
  const md = (await getOverride("privacy")) || DEFAULT_PRIVACY_MD;
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
          <Link href="/terms" style={{ color: "#64748b" }}>服務條款</Link>
        </p>
      </div>
    </div>
  );
}
