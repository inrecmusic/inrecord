import Link from "next/link";

export const metadata = { title: "服務條款 | InRecord" };

export default function TermsPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: "40px 20px 80px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        {/* back */}
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#64748b", textDecoration: "none", marginBottom: 28, fontWeight: 700 }}>
          ← 返回首頁
        </Link>

        <div style={{ background: "#fff", borderRadius: 20, padding: "40px 44px", boxShadow: "0 2px 24px rgba(15,23,42,.07)" }}>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: "#0f172a", margin: "0 0 6px", letterSpacing: "-.03em" }}>服務條款</h1>
          <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 32px" }}>InRecord｜流行鋼琴零基礎入門課 ／ 最後更新：2026 年 5 月 1 日</p>

          <Section title="1. 服務說明">
            InRecord（以下簡稱「本平台」）提供零基礎流行鋼琴線上課程的試看、購買與學習服務。使用本平台服務，即表示您同意遵守本服務條款。
          </Section>

          <Section title="2. 課程存取">
            <ul>
              <li>本平台課程以 <b>Email 連結</b> 形式授權，每組購買僅限購買人本人使用。</li>
              <li>請勿將課程連結或存取資訊分享、轉讓或販售給他人。</li>
              <li>課程存取效期為購買日起 <b>永久有效</b>（本平台正常營運期間）。</li>
            </ul>
          </Section>

          <Section title="3. 課程購買與付款">
            <ul>
              <li>所有課程費用以<b>新台幣（TWD）</b>計價。</li>
              <li>付款透過 <b>Payuni 統一金流</b>安全處理，支援信用卡、ATM 轉帳、超商繳費。</li>
              <li>訂單成立後，系統將自動寄送購買確認信至您的 Email。</li>
              <li>課程售價可能依早鳥或促銷方案調整，恕不另行通知。</li>
            </ul>
          </Section>

          <Section title="4. 退款政策">
            <ul>
              <li>課程購買後 <b>7 天內</b>，如對課程內容不滿意，可申請全額退款。</li>
              <li>退款申請請 Email 至 <a href="mailto:inrecmusic@gmail.com" style={{ color: "#2563eb" }}>inrecmusic@gmail.com</a>，說明購買日期及退款原因。</li>
              <li>超過 7 天後恕不受理退款申請。</li>
              <li>已完整觀看超過 <b>50% 課程內容</b>者，本平台保留拒絕退款之權利。</li>
            </ul>
          </Section>

          <Section title="5. 智慧財產權">
            <ul>
              <li>本平台所有課程影片、講義、圖文內容之著作權均歸 <b>InRecord</b> 所有。</li>
              <li>嚴禁以任何形式錄製、截圖、重製、翻譯或散布課程內容。</li>
              <li>嚴禁將課程內容用於商業目的、教學授課或二次販售。</li>
              <li>違反著作權相關規定者，本平台保留追究民事及刑事責任之權利。</li>
            </ul>
          </Section>

          <Section title="6. 使用規範">
            使用本平台服務，您同意不得：
            <ul>
              <li>以任何技術手段繞過課程存取限制或 DRM 保護。</li>
              <li>使用自動化工具（爬蟲、Bot）存取本平台內容。</li>
              <li>散布不實評論或惡意影響本平台商譽。</li>
              <li>干擾、攻擊或破壞本平台正常運作。</li>
            </ul>
          </Section>

          <Section title="7. 課程內容異動">
            <ul>
              <li>本平台保留更新、修改或補充課程內容之權利，以確保內容品質與時效性。</li>
              <li>重大內容調整將提前透過 Email 通知已購課學員。</li>
            </ul>
          </Section>

          <Section title="8. 服務中斷與免責聲明">
            <ul>
              <li>本平台課程內容僅供教學參考，不保證特定練習成果或演奏水準。</li>
              <li>對因網路中斷、系統維護或不可抗力因素（天災、疫情等）造成之服務中斷，本平台不負賠償責任，但將盡速公告並處理。</li>
            </ul>
          </Section>

          <Section title="9. 準據法與管轄">
            本服務條款依<b>中華民國法律</b>解釋，如發生爭議，雙方同意以<b>台灣台北地方法院</b>為第一審管轄法院。
          </Section>

          <Section title="10. 聯絡方式" last>
            如對本服務條款有任何疑問：
            <ul>
              <li><b>Email</b>：<a href="mailto:inrecmusic@gmail.com" style={{ color: "#2563eb" }}>inrecmusic@gmail.com</a></li>
              <li><b>Instagram</b>：@inrec.music</li>
              <li>服務時間：週一至週五 10:00–18:00</li>
            </ul>
          </Section>
        </div>

        <p style={{ textAlign: "center", marginTop: 24, fontSize: 13, color: "#94a3b8" }}>
          © InRecord｜流行鋼琴零基礎入門課 ·{" "}
          <Link href="/privacy" style={{ color: "#64748b" }}>隱私權政策</Link>
        </p>
      </div>
    </div>
  );
}

function Section({ title, children, last }) {
  return (
    <div style={{ marginBottom: last ? 0 : 28 }}>
      <h2 style={{ fontSize: 15, fontWeight: 900, color: "#0f172a", margin: "0 0 10px", paddingBottom: 8, borderBottom: "1px solid #f1f5f9" }}>{title}</h2>
      <div style={{ fontSize: 14, color: "#475569", lineHeight: 1.8 }}>{children}</div>
    </div>
  );
}
