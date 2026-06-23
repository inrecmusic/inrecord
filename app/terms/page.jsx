import Link from "next/link";

export const metadata = { title: "服務條款 | InRecord" };

const subHead = { fontWeight: 800, color: "#0f172a", margin: "18px 0 6px" };
const cellTh = { textAlign: "left", padding: "8px 12px", border: "1px solid #e2e8f0", fontWeight: 800, color: "#0f172a" };
const cellTd = { padding: "8px 12px", border: "1px solid #e2e8f0" };

export default function TermsPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: "40px 20px 80px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        {/* back */}
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#64748b", textDecoration: "none", marginBottom: 28, fontWeight: 700 }}>
          ← 返回首頁
        </Link>

        <div className="content-card" style={{ background: "#fff", borderRadius: 20, boxShadow: "0 2px 24px rgba(15,23,42,.07)" }}>
          <h1 style={{ fontFamily: "var(--type-display)", fontSize: 30, fontWeight: 400, color: "#0f172a", margin: "0 0 6px", letterSpacing: "-.02em" }}>服務條款</h1>
          <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 32px" }}>InRecord｜流行鋼琴零基礎入門課 ／ 最後更新：2026 年 6 月 23 日</p>

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

          <Section title="4. 退費政策">
            <p style={subHead}>一、費用計算基準</p>
            <ul>
              <li>本課程退費一律以您<b>實際支付之優惠總價</b>為計算基準，不以課程原價或單堂定價回算已使用部分。</li>
              <li>組合方案（含贈送單元）以整筆訂單之實付總額為基準，不就個別單元分拆計算。</li>
            </ul>

            <p style={subHead}>二、試看與七日鑑賞期</p>
            <ul>
              <li>本平台於購買前已提供各章節<b>試看單元</b>，供您充分檢視課程內容。</li>
              <li>依消費者保護法及「通訊交易解除權合理例外情事準則」，線上影音課程屬數位內容；於本平台已提供前述試看機會之情形下，<b>不適用網路購物七日無條件解除權</b>之規定。</li>
              <li>為保障學員權益，本平台仍主動提供下列退費機制。</li>
            </ul>

            <p style={subHead}>三、退費級距</p>
            <p style={{ margin: "0 0 6px" }}><b>（一）全額退費（退還 100%）</b>——符合下列任一情形：</p>
            <ul>
              <li>自購買日起 <b>7 日內，且尚未觀看任何正式付費單元</b>（試看單元不計入）。</li>
              <li>已觀看課程時數<b>未超過總時數 10%</b>。</li>
              <li>課程未達開課條件、或本平台無法提供課程。</li>
            </ul>
            <p style={{ margin: "10px 0 8px" }}><b>（二）比例退費</b>——超過前款範圍者，依「<b>已觀看時數 ÷ 課程總時數</b>」計算使用比例退費：</p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, margin: "0 0 4px" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={cellTh}>已使用比例</th>
                  <th style={cellTh}>退費比例</th>
                </tr>
              </thead>
              <tbody>
                <tr><td style={cellTd}>超過 10%、未超過 30%</td><td style={cellTd}>退還 <b>80%</b></td></tr>
                <tr><td style={cellTd}>超過 30%、未超過 50%</td><td style={cellTd}>退還 <b>50%</b></td></tr>
                <tr><td style={cellTd}>超過 50%</td><td style={cellTd}><b>不予退費</b></td></tr>
              </tbody>
            </table>

            <p style={subHead}>四、違約金</p>
            <ul>
              <li>因可歸責於您之事由終止契約者，本平台得自應退金額中扣除違約金，<b>違約金上限不超過應退金額之 20%</b>。</li>
            </ul>

            <p style={subHead}>五、退費方式與時程</p>
            <ul>
              <li>退費申請請來信 <a href="mailto:inrecmusic@gmail.com" style={{ color: "#2563eb" }}>inrecmusic@gmail.com</a>，並提供<b>訂單編號</b>。</li>
              <li>退款於受理後 <b>5 個工作天</b>內，依原付款方式退還。</li>
              <li>退費完成後，您於本課程之觀看權限同時終止。</li>
            </ul>

            <p style={subHead}>六、其他</p>
            <ul>
              <li>已使用且尚未失效之折扣券、點數，依當次活動規則處理。</li>
              <li>透過第三方平台（如 App 內購）購買者，退費依該平台規定辦理。</li>
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
