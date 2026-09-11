import Link from "next/link";

export const metadata = {
  title: "聯絡我們 | InRecord",
  description: "InRecord 音樂刻課程客服：課程問題、退款申請與合作洽詢的聯絡方式。",
  alternates: { canonical: "/contact" },
};

// 全靜態頁（無互動），維持 Server Component 才能輸出獨立 metadata；
// 圖示改用內嵌 SVG（lucide 走 React context，Server Component 不能用）。
function MailIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/>
      <rect x="2" y="4" width="20" height="16" rx="2"/>
    </svg>
  );
}

function InstagramIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#e1306c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
      <circle cx="12" cy="12" r="4"/>
      <circle cx="17.5" cy="6.5" r="1" fill="#e1306c" stroke="none"/>
    </svg>
  );
}

export default function ContactPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: "40px 20px 80px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>

        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#64748b", textDecoration: "none", marginBottom: 28, fontWeight: 700 }}>
          ← 返回首頁
        </Link>

        <div className="content-card" style={{ background: "#fff", borderRadius: 20, boxShadow: "0 2px 24px rgba(15,23,42,.07)" }}>
          <h1 style={{ fontFamily: "var(--type-display)", fontSize: 30, fontWeight: 400, color: "#0f172a", margin: "0 0 6px", letterSpacing: "-.02em" }}>聯絡我們</h1>
          <p style={{ fontSize: 14, color: "#64748b", margin: "0 0 32px", lineHeight: 1.7 }}>
            有任何課程問題、退款申請或合作洽詢，歡迎透過以下方式聯繫，我們會在 3 個工作日內回覆。
          </p>

          <div style={{ display: "grid", gap: 16 }}>
            <ContactItem
              icon={<MailIcon size={18} />}
              label="Email"
              value="support@inrecordmusic.com"
              href="mailto:support@inrecordmusic.com"
            />
            <ContactItem
              icon={<InstagramIcon size={18} />}
              label="Instagram"
              value="@inrecord.music"
              href="https://www.instagram.com/inrecord.music"
              external
            />
          </div>

          <div style={{ marginTop: 32, padding: "20px 24px", background: "#eff6ff", borderRadius: 12, border: "1px solid #bfdbfe" }}>
            <p style={{ margin: 0, fontSize: 13, color: "#1d4ed8", lineHeight: 1.7 }}>
              <strong>退款申請</strong>請寄信至 <a href="mailto:support@inrecordmusic.com" style={{ color: "#2563eb", fontWeight: 700 }}>support@inrecordmusic.com</a>，附上訂單編號與退款原因。預售訂單的 7 天鑑賞期自 <strong>10/31 正式開課日</strong>起算：期間內觀看進度未超過 5%，可申請全額退費（第 8～14 日退 30%）；受理後 7 個工作天內依原付款方式退還。完整級距見<Link href="/terms" style={{ color: "#2563eb", fontWeight: 700 }}>服務條款</Link>。
            </p>
          </div>
        </div>

        <p style={{ textAlign: "center", marginTop: 24, fontSize: 13, color: "#94a3b8" }}>
          © InRecord｜音樂刻 ·{" "}
          <Link href="/privacy" style={{ color: "#64748b" }}>隱私權政策</Link>
          {" · "}
          <Link href="/terms" style={{ color: "#64748b" }}>服務條款</Link>
        </p>
      </div>
    </div>
  );
}

function ContactItem({ icon, label, value, href, external }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", background: "#f8fafc", borderRadius: 12, border: "1px solid #f1f5f9" }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: "#fff", border: "1px solid #e8ecf0", display: "grid", placeItems: "center", flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 2 }}>{label}</div>
        {href ? (
          <a
            href={href}
            target={external ? "_blank" : undefined}
            rel={external ? "noreferrer" : undefined}
            style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", textDecoration: "none" }}
          >
            {value}
          </a>
        ) : (
          <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{value}</span>
        )}
      </div>
    </div>
  );
}
