import Link from "next/link";

export const metadata = { title: "隱私權政策 | InRecord" };

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: "40px 20px 80px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        {/* back */}
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#64748b", textDecoration: "none", marginBottom: 28, fontWeight: 700 }}>
          ← 返回首頁
        </Link>

        <div style={{ background: "#fff", borderRadius: 20, padding: "40px 44px", boxShadow: "0 2px 24px rgba(15,23,42,.07)" }}>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: "#0f172a", margin: "0 0 6px", letterSpacing: "-.03em" }}>隱私權政策</h1>
          <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 32px" }}>InRecord｜流行鋼琴零基礎入門課 ／ 最後更新：2026 年 5 月 1 日</p>

          <Section title="1. 適用範圍">
            本隱私權政策適用於 InRecord（以下簡稱「本平台」）所提供之線上鋼琴課程服務，包括課程試看申請、購買、學習及相關客服互動。使用本平台即表示您同意本政策之內容。
          </Section>

          <Section title="2. 蒐集的個人資料">
            當您使用本平台服務時，我們可能蒐集以下資料：
            <ul>
              <li><b>Gmail 地址</b>：您填寫課程試看申請表單時主動提供。</li>
              <li><b>購買資訊</b>：透過 Payuni 統一金流處理，本平台不儲存完整信用卡號碼。</li>
              <li><b>使用紀錄</b>：課程頁瀏覽行為與影片觀看紀錄（用於改善課程體驗）。</li>
              <li><b>裝置資訊</b>：瀏覽器類型、作業系統、IP 位址（僅用於系統安全與統計）。</li>
            </ul>
          </Section>

          <Section title="3. 資料使用目的">
            蒐集的個人資料將用於以下用途：
            <ul>
              <li>寄送課程試看連結及相關學習資訊。</li>
              <li>處理課程購買訂單與開立收據。</li>
              <li>提供售後客服與技術支援。</li>
              <li>發送重要課程更新或促銷通知（可隨時退訂）。</li>
              <li>改善課程內容與平台使用體驗。</li>
            </ul>
          </Section>

          <Section title="4. 資料分享與第三方服務">
            本平台使用以下第三方服務處理部分資料：
            <ul>
              <li><b>Payuni 統一金流</b>：金流支付處理，受 Payuni 隱私權政策保護。</li>
              <li><b>Brevo</b>：Email 名單管理與自動化郵件寄送。</li>
              <li><b>Supabase</b>：PostgreSQL 資料庫儲存，採用業界標準加密。</li>
              <li><b>Google Analytics / Meta Pixel</b>：網站流量與廣告成效分析（可透過瀏覽器設定退出）。</li>
            </ul>
            本平台不會將您的個人資料出售、出租或以任何形式交換給第三方商業機構。
          </Section>

          <Section title="5. Cookie 與追蹤技術">
            本平台使用 Cookie 及類似技術以：
            <ul>
              <li>維持您的課程存取狀態。</li>
              <li>分析網站使用情況以改善服務。</li>
              <li>提供個人化學習體驗。</li>
            </ul>
            您可透過瀏覽器設定拒絕或刪除 Cookie，但部分功能可能因此受限。
          </Section>

          <Section title="6. 資料保存期限">
            <ul>
              <li>試看申請資料：自申請日起保存 <b>2 年</b>。</li>
              <li>購買訂單資料：依電商交易法規保存 <b>5 年</b>。</li>
              <li>您可隨時要求提前刪除個人資料（詳見第 7 條）。</li>
            </ul>
          </Section>

          <Section title="7. 您的權利">
            依據個人資料保護法，您享有以下權利：
            <ul>
              <li><b>查詢或閱覽</b>您的個人資料。</li>
              <li><b>請求複製</b>您的個人資料。</li>
              <li><b>請求補充或更正</b>不正確的個人資料。</li>
              <li><b>請求刪除</b>您的個人資料。</li>
              <li><b>請求停止蒐集、處理或使用</b>您的個人資料。</li>
            </ul>
            如需行使上述權利，請透過 Email 聯絡我們，我們將於 <b>7 個工作天內</b>回覆處理。
          </Section>

          <Section title="8. 未成年人保護">
            本平台服務適用年齡為 13 歲以上。若您未滿 13 歲，請勿提供個人資料，並請由家長或監護人代為操作。
          </Section>

          <Section title="9. 隱私權政策異動">
            本平台保留隨時修改本政策之權利。重大異動時，將透過 Email 或網站公告通知您。繼續使用本服務即表示您同意修訂後的政策。
          </Section>

          <Section title="10. 聯絡我們" last>
            如對本隱私權政策有任何疑問，請透過以下方式聯繫：
            <ul>
              <li><b>Email</b>：<a href="mailto:inrecmusic@gmail.com" style={{ color: "#2563eb" }}>inrecmusic@gmail.com</a></li>
              <li><b>Instagram</b>：@inrec.music</li>
              <li>服務時間：週一至週五 10:00–18:00</li>
            </ul>
          </Section>
        </div>

        <p style={{ textAlign: "center", marginTop: 24, fontSize: 13, color: "#94a3b8" }}>
          © InRecord｜流行鋼琴零基礎入門課 ·{" "}
          <Link href="/terms" style={{ color: "#64748b" }}>服務條款</Link>
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
