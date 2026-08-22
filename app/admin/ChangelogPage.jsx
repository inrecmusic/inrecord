"use client";
import { History } from "lucide-react";

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

const CHANGELOG = [
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
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "8px 4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <History size={22} color="#2563eb" />
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#0f172a" }}>系統更新記錄</h1>
      </div>
      <p style={{ margin: "0 0 24px", fontSize: 14, color: "#64748b" }}>
        平台做過的重要更新與修復（僅後台可見）。最新在上。
      </p>

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
