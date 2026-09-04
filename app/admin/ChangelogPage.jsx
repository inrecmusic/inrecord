"use client";
import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { adminFetch } from "@/lib/admin-client";

// 系統更新記錄（後台內部）。新增更新：在最上方插一筆即可。
// tag 對應顏色見 TAGS。
const TAGS = {
  資安:   { bg: "#fee2e2", fg: "#b91c1c" },
  教室:   { bg: "#dbeafe", fg: "#1d4ed8" },
  後台:   { bg: "#fef3c7", fg: "#b45309" },
  修復:   { bg: "#dcfce7", fg: "#15803d" },
  金流:   { bg: "#e0e7ff", fg: "#4338ca" },
  行銷:   { bg: "#f3e8ff", fg: "#7e22ce" },
  功能:   { bg: "#e2e8f0", fg: "#334155" },
};

// 訂閱費用（手動維護）。金額異動時直接改這裡。
// amount：月付填月費、年付填年費、按量填 null（金額不固定，不列入合計）。
const SUBSCRIPTIONS = [
  { service: "Vercel",       plan: "Pro",       amount: 20,   cycle: "month", nextCharge: "每月 27 日", note: "團隊 inrecmusic-9815" },
  { service: "Supabase",     plan: "Pro",       amount: 25,   cycle: "month", nextCharge: "每月 27 日", note: "org Inrecord" },
  { service: "Bunny Stream", plan: "按量計費",  amount: null, cycle: "usage", nextCharge: "每月結算",   note: "依影片流量，1080p 約 2.5GB/人·時" },
  { service: "Hostinger",    plan: "網域續約",  amount: null, cycle: "year",  nextCharge: "待確認",     note: "inrecordmusic.com，金額請填入" },
  // amount 以美元計並乘匯率合計，Brevo 收台幣 NT$71/月 → 填 null 不入合計，金額寫在 note 免得幣別混算
  { service: "Brevo",        plan: "Starter",   amount: null, cycle: "month", nextCharge: "每月 2 日",  note: "NT$71/月・5,000 封/月、無每日上限（2026-09-02 由 Free 升級）" },
  { service: "Upstash",      plan: "Free",      amount: 0,    cycle: "free",  nextCharge: "—",          note: "限流用，目前流量免費額度內" },
];

// 匯率為概估，僅供台幣換算參考。
const USD_TWD = 32;
const monthlyFixed = SUBSCRIPTIONS
  .filter(s => s.cycle === "month" && typeof s.amount === "number")
  .reduce((sum, s) => sum + s.amount, 0);
const hasUnknown = SUBSCRIPTIONS.some(s => s.amount === null);

const CYCLE_LABEL = { month: "月付", year: "年付", usage: "按量", free: "免費" };

const usd = n => `US$${n.toLocaleString("en-US")}`;
const twd = n => `NT$${Math.round(n * USD_TWD).toLocaleString("en-US")}`;

const TH = { padding: "0 10px 8px 0", fontWeight: 600 };
const TD = { padding: "9px 10px 9px 0", color: "#475569" };

const CHANGELOG = [
  { date: "2026-08-27", tag: "後台", title: "升級 Pro ＋ 伺服器搬到東京", items: [
    "Vercel 升級 Pro（解除 Hobby 禁商業營利的條款風險，cron 不再限每日一次）",
    "Supabase 升級 Pro（連線數與請求額度提升，不再有閒置自動暫停）",
    "Vercel 函式區域由 iad1（美國華盛頓）改為 hnd1（東京），與 Supabase 同區——台灣學員每次登入／進教室／結帳都少繞一趟太平洋",
    "本頁新增「訂閱費用」面板，可直接確認下月預計扣款",
  ]},
  { date: "2026-08-22", tag: "資安", title: "資安加固", items: [
    "清理 8 個第三方套件的安全漏洞（相依套件更新）",
    "上線內容安全政策 CSP（正式阻擋模式，防跨站腳本/資源注入），三頁實測零違規",
  ]},
  { date: "2026-08-22", tag: "教室", title: "學員中心改版「音樂廳」", items: [
    "教室首頁改為學習儀表板：歡迎問候、整體進度環、章節列表、一鍵繼續上課",
    "深色／淺色主題可自由切換（記住偏好）",
    "播放頁獨立為 /classroom/watch，點單元才進入",
  ]},
  { date: "2026-08-21", tag: "修復", title: "影片播放修復", items: [
    "修正影片 404（Bunny 影片庫 ID 未設定），課程影片恢復正常播放",
  ]},
  { date: "2026-08-21", tag: "後台", title: "後台品質修復（開課關鍵四項）", items: [
    "補寄開課信在預購期不再誤寄「課程已開通」文案",
    "手動開通失敗時不再留下孤兒訂單、不再回報假成功",
    "遊戲全螢幕預覽修補後台權杖外洩風險",
    "「全部開通」改分頁，避免訂單量大時漏開",
  ]},
  { date: "2026-08-21", tag: "教室", title: "學員資料表單與外觀", items: [
    "修正首次填學員資料的儲存逾時（存檔前自動更新登入狀態）",
    "鋼琴程度／練習器材／年齡層選項擴充",
    "教室左上角改用 InRecord Logo；暫時隱藏完課證書入口",
  ]},
  { date: "2026-08-18", tag: "資安", title: "全站架構健檢", items: [
    "全 codebase 安全與正確性審查，修復多項高風險問題並上線",
  ]},
  { date: "2026-08-12", tag: "功能", title: "互動遊戲安全強化", items: [
    "遊戲裝置數上限、時間窗限制、浮水印防盜",
  ]},
  { date: "2026-08-09", tag: "功能", title: "學員資料頁", items: [
    "學員個人資料收集與編輯、首次登入引導、隱私條文",
  ]},
  { date: "2026-07-26", tag: "行銷", title: "追蹤碼中心", items: [
    "後台多平台追蹤碼設定（GA／Meta Pixel）、UTM 歸因",
  ]},
  { date: "2026-07-10", tag: "教室", title: "帳號設定與忘記密碼", items: [
    "學員可改顯示名稱、忘記密碼重設流程",
  ]},
  { date: "2026-06-30", tag: "金流", title: "金流與電子發票上線", items: [
    "PAYUNi 正式金流串接、Amego 電子發票",
  ]},
  { date: "2026-06-24", tag: "行銷", title: "電子報群發", items: [
    "後台編輯內容群發購課／註冊學員",
  ]},
];

export default function ChangelogPage() {
  // Bunny 即時用量（本月至今費用／流量／餘額）；抓不到就維持「依用量」並附原因
  const [bunny, setBunny] = useState(null);
  useEffect(() => {
    adminFetch("/api/admin/bunny-usage")
      .then(r => r.json())
      .then(d => setBunny(d.ok ? d : { error: d.error || "unknown" }))
      .catch(() => setBunny({ error: "unreachable" }));
  }, []);
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "8px 4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <History size={22} color="#2563eb" />
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#0f172a" }}>系統更新記錄</h1>
      </div>
      <p style={{ margin: "0 0 24px", fontSize: 14, color: "#64748b" }}>
        平台做過的重要更新與修復（僅後台可見）。最新在上。
      </p>

      <div style={{ background: "#fff", border: "1px solid #e5e8ec", borderRadius: 12, padding: "14px 16px", marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>訂閱費用</span>
          <span style={{ fontSize: 12.5, color: "#94a3b8" }}>每月固定支出</span>
          <span style={{ marginLeft: "auto", fontSize: 15, fontWeight: 800, color: "#0f172a", fontVariantNumeric: "tabular-nums" }}>
            {usd(monthlyFixed)}<span style={{ fontWeight: 600, color: "#64748b" }}>　≈ {twd(monthlyFixed)}</span>
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 520 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#94a3b8", fontSize: 12 }}>
                <th style={TH}>服務</th><th style={TH}>方案</th>
                <th style={{ ...TH, textAlign: "right" }}>金額</th>
                <th style={{ ...TH, textAlign: "right" }}>約台幣</th>
                <th style={TH}>週期</th><th style={TH}>下次扣款</th>
              </tr>
            </thead>
            <tbody>
              {SUBSCRIPTIONS.map(s => {
                const live = s.service === "Bunny Stream" && bunny?.ok ? bunny : null;
                const bunnyErr = s.service === "Bunny Stream" && bunny?.error;
                return (
                <tr key={s.service} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ ...TD, fontWeight: 600, color: "#0f172a" }}>
                    {s.service}
                    <div style={{ fontWeight: 400, fontSize: 11.5, color: "#94a3b8", marginTop: 2 }}>
                      {live
                        ? `本月流量 ${live.bandwidthGB} GB · 帳戶餘額 US$${live.balance.toFixed(2)} · 更新 ${new Date(live.fetchedAt).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}`
                        : bunnyErr ? `${s.note} · Bunny 資料暫時抓不到（${bunnyErr}）` : s.note}
                    </div>
                  </td>
                  <td style={{ ...TD, verticalAlign: "top" }}>{s.plan}</td>
                  <td style={{ ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums", verticalAlign: "top" }}>
                    {live
                      ? <>US${live.thisMonthCharges.toFixed(2)}<div style={{ fontWeight: 400, fontSize: 11, color: "#94a3b8" }}>本月至今</div></>
                      : s.amount === null ? <span style={{ color: "#b45309" }}>依用量</span> : s.amount === 0 ? "免費" : usd(s.amount)}
                  </td>
                  <td style={{ ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#64748b", verticalAlign: "top" }}>
                    {live ? twd(live.thisMonthCharges) : typeof s.amount === "number" && s.amount > 0 ? twd(s.amount) : "—"}
                  </td>
                  <td style={{ ...TD, verticalAlign: "top" }}>{CYCLE_LABEL[s.cycle]}</td>
                  <td style={{ ...TD, color: "#64748b", verticalAlign: "top" }}>{s.nextCharge}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p style={{ margin: "12px 0 0", fontSize: 12, color: "#94a3b8", lineHeight: 1.7 }}>
          台幣為概估（匯率 1 美元 ≈ {USD_TWD} 元），實際以帳單為準。
          {hasUnknown && " 標「依用量」者金額浮動，未計入每月固定支出。"}
          <br />金額有異動時，改 <code style={{ fontFamily: "ui-monospace,monospace", fontSize: 11.5 }}>ChangelogPage.jsx</code> 最上方的 <code style={{ fontFamily: "ui-monospace,monospace", fontSize: 11.5 }}>SUBSCRIPTIONS</code> 即可。
        </p>
      </div>

      <div style={{ position: "relative", paddingLeft: 26 }}>
        <div style={{ position: "absolute", left: 6, top: 6, bottom: 6, width: 2, background: "#e2e8f0" }} />
        {CHANGELOG.map((e, i) => {
          const t = TAGS[e.tag] || TAGS.功能;
          return (
            <div key={i} style={{ position: "relative", marginBottom: 22 }}>
              <div style={{ position: "absolute", left: -26, top: 4, width: 14, height: 14, borderRadius: "50%", background: "#fff", border: `3px solid ${t.fg}` }} />
              <div style={{ background: "#fff", border: "1px solid #e5e8ec", borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                  <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 12.5, color: "#94a3b8", fontVariantNumeric: "tabular-nums" }}>{e.date}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, padding: "2px 9px", borderRadius: 100, background: t.bg, color: t.fg }}>{e.tag}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{e.title}</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                  {e.items.map((it, j) => (
                    <li key={j} style={{ fontSize: 13.5, color: "#475569", lineHeight: 1.6 }}>{it}</li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
