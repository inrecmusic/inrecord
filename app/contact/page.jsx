"use client";
import Link from "next/link";
import { Mail, Clock } from "lucide-react";

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

        <div style={{ background: "#fff", borderRadius: 20, padding: "40px 44px", boxShadow: "0 2px 24px rgba(15,23,42,.07)" }}>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: "#0f172a", margin: "0 0 6px", letterSpacing: "-.03em" }}>聯絡我們</h1>
          <p style={{ fontSize: 14, color: "#64748b", margin: "0 0 32px", lineHeight: 1.7 }}>
            有任何課程問題、退款申請或合作洽詢，歡迎透過以下方式聯繫，我們將於 2 個工作天內回覆。
          </p>

          <div style={{ display: "grid", gap: 16 }}>
            <ContactItem
              icon={<Mail size={18} color="#2563eb" />}
              label="Email"
              value="inrecmusic@gmail.com"
              href="mailto:inrecmusic@gmail.com"
            />
            <ContactItem
              icon={<InstagramIcon size={18} />}
              label="Instagram"
              value="@inrec.music"
              href="https://www.instagram.com/inrec.music"
              external
            />
            <ContactItem
              icon={<Clock size={18} color="#64748b" />}
              label="服務時間"
              value="週一至週五 10:00–18:00"
            />
          </div>

          <div style={{ marginTop: 32, padding: "20px 24px", background: "#eff6ff", borderRadius: 12, border: "1px solid #bfdbfe" }}>
            <p style={{ margin: 0, fontSize: 13, color: "#1d4ed8", lineHeight: 1.7 }}>
              <strong>退款申請</strong>請於購買後 7 天內寄信至 <a href="mailto:inrecmusic@gmail.com" style={{ color: "#2563eb", fontWeight: 700 }}>inrecmusic@gmail.com</a>，並說明購買日期及退款原因。
            </p>
          </div>
        </div>

        <p style={{ textAlign: "center", marginTop: 24, fontSize: 13, color: "#94a3b8" }}>
          © InRecord｜流行鋼琴零基礎入門課 ·{" "}
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
