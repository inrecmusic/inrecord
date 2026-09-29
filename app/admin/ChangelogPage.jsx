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
  { date: "2026-09-30", tag: "行銷", title: "電子報字級放大", items: [
    "電子報內文由 18px 放大到 20px，標題、表格、按鈕、頁尾一併加大，長輩閱讀更清楚；並鎖定手機不自動縮字",
    "電子報推成 Brevo 範本時，價格佔位符改為推送當下先代入（先前含 {{目前售價}} 的草稿會被 Brevo 解析器拒絕）",
  ]},
  { date: "2026-09-29", tag: "行銷", title: "廣告成效顯示資料更新時間", items: [
    "廣告成效頁顯示「資料更新時間」，一眼看出數字是不是最新；Meta 同步改為每 3 小時一次，並回補近 30 天資料",
  ]},
  { date: "2026-09-28", tag: "行銷", title: "免費試看動線與廣告歸因", items: [
    "首頁主視覺新增「課程免費試看」「互動遊戲體驗」兩顆次要按鈕，主按鈕獨佔一排；點試看直接到試看頁，不用再捲到頁尾",
    "留完 Email 當場就能看試看影片，不必再去收信；按過試看就不再跳進站彈窗",
    "Lead（留信箱）事件改由伺服器端補送 Meta CAPI，不怕瀏覽器擋追蹤",
    "後台廣告成效新增「試看名單」與每名單成本",
    "Meta Pixel 網域驗證標籤上線，安全政策放行 facebook.com",
  ]},
  { date: "2026-09-28", tag: "後台", title: "手動開通與開課信修正", items: [
    "手動開通可一併寄開課通知",
    "開課信改寄給實際上課的帳號，後台訂單看得到開通帳號",
    "開課通知的「已付款未開通」統計改以實際開通帳號比對，數字不再偏差",
  ]},
  { date: "2026-09-27", tag: "教室", title: "互動樂譜第一階段", items: [
    "播放頁新增「樂譜」分頁：一份譜可切換五線譜／簡譜、開關和弦、跟奏播放並高亮、列印，取代一張張 PDF",
    "範例曲小蜜蜂已掛在有影片的 1-2 單元，五線譜符尾改為連桿寫法",
    "後台管理與 MusicXML／MIDI 匯入為下一階段",
  ]},
  { date: "2026-09-26", tag: "教室", title: "學員中心改版「音樂廳夜場」", items: [
    "學員中心儀表板重新設計：深色預設、可切淺色，封面與進度一目了然",
    "「接著看」優先接續看到一半的單元；試看單元不列入課程進度",
    "文字排版重整；上架時程集中管理，播放頁側欄與儀表板顯示一致",
    "Ch3 預計上架 9/30；Ch4 由 9/30 延到 10/7，與 Ch5 同日",
  ]},
  { date: "2026-09-25", tag: "金流", title: "ATM／超商繳費期限對齊優惠截止", items: [
    "ATM／超商取號時依這筆價格的截止日設定繳費期限，虛擬帳號與優惠價同一天失效",
    "截止前不到約 2 小時 15 分時只開信用卡與 AFTEE，避免來不及繳",
    "優惠券起訖日一律以台灣日期計算；付款方式代碼對照依 PAYUNi 文件修正",
  ]},
  { date: "2026-09-24", tag: "行銷", title: "電子報排版與簽名檔", items: [
    "連續行併成同一段，行距改用換行，不再每行都變成獨立段落",
    "信尾品牌簽名檔補上 Facebook 粉絲專頁",
    "Ch2 第三支遊戲上線；唱名階梯改名「唱名小達人」（9/23）",
  ]},
  { date: "2026-09-20", tag: "資安", title: "站台健檢與修補", items: [
    "付款導回憑證只發給驗章成功的導回，補上可被冒用的漏洞",
    "結帳金額與訂單對帳、取號不再算成功、證書印學員真名",
    "完成判定改以後台影片長度為準；正式 vercel.app 別名自動導回正式網域",
    "付款成功頁與預購信文案對齊人工開通流程",
  ]},
  { date: "2026-09-20", tag: "後台", title: "潛客名單清理與試看領取統計", items: [
    "潛客名單可比對已購買者，一鍵移出 Brevo 名單；付款成功後購買／開通信箱自動移出潛客名單",
    "儀表板新增試看領取統計卡，點擊展開每日趨勢（90 天以週彙總）；移除「課程數量」卡片",
    "留信箱成功訊息提醒檢查促銷／垃圾郵件匣",
  ]},
  { date: "2026-09-19", tag: "修復", title: "付款明細依付款方式顯示", items: [
    "ATM／超商訂單的付款明細不再誤報「找不到分期欄位」",
  ]},
  { date: "2026-09-18", tag: "行銷", title: "電子報數字佔位符與廣告停損規則", items: [
    "電子報內文可用 {{目前售價}}、{{下次售價}}、{{調漲日期}} 等佔位符，寄出當下依波段現算，不用每次手改",
    "廣告日報與週報加入冷啟動停損規則的建議",
    "廣告頁空狀態區分「尚未接 Meta」與「已接但無花費」",
  ]},
  { date: "2026-09-17", tag: "行銷", title: "首頁限時倒數與方案改名", items: [
    "方案改名「完整課程方案」；方案卡加「限時倒數・早鳥優惠」與折數緞帶，hero 膠囊顯示「限時 X.X 折・早鳥優惠」",
    "粉絲方案結束後，hero 改倒數當下波段剩餘時間",
    "憑證折抵改為「當下售價再折 N 元」，不受粉絲直購截止日影響、持續開放",
    "所有信件連結統一帶 UTM；電子報群發自動以草稿代號補 campaign",
    "新增廣告日報 cron；提供合作夥伴唯讀廣告端點，與後台管理員權限分離",
  ]},
  { date: "2026-09-16", tag: "行銷", title: "信件改版", items: [
    "預購成功信改文案，購買方案顯示購買當下的銷售階段；開通版信件與預購版外觀一致",
    "未付款提醒信改用電子報版面：先文字後圖、加上架時程、CTA 置頂與置尾各一",
    "後台電子報草稿切換改下拉選單，草稿多時不再撐開整列",
  ]},
  { date: "2026-09-15", tag: "資安", title: "安全補強與首頁提速", items: [
    "刪除一支未使用的舊介面（它會把所有已發布影片的編號一次回給已購課學員，未套分章上架限制）",
    "結帳加上「同一 Email 一天最多 5 筆待付款訂單」限制；未付款提醒信改為同一信箱 7 天只寄一次（先前可被利用對任意信箱重複寄信）",
    "學習進度改為只能經由官網寫入（先前登入帳號可繞過官網直接把單元標成已完成，影響進度與證書）",
    "後台補寄信、刪留言、回覆留言改為留下操作紀錄；早鳥權限比對修正（含底線的 Email 可能誤中他人）",
    "首頁提速：主視覺文字不再等程式載入才顯示、主視覺圖片預先載入、社會證明數字改由伺服器先算好（每位訪客少一次資料庫查詢）、講師照延後載入",
    "登入與重設密碼的錯誤訊息全面中文化；忘記密碼碰到寄送失敗不再假裝「已寄出」",
  ]},
  { date: "2026-09-14", tag: "資安", title: "站台健檢與修正（官網／後台／教室）", items: [
    "資料庫權限收緊：自助註冊帳號不能再繞過官網直接讀留言者 Email、灌課程評價或塞作業紀錄",
    "留信箱換試看加上三道防濫用限制（同一信箱一小時一封、全站每日上限），避免寄信額度被灌爆導致登入驗證碼、購課信寄不出去",
    "追蹤碼的安全設定補齊 GA4／Google Ads／LINE：先前就算在後台填了 ID 也會靜默失效、投放端看到 0 轉換",
    "訂單日期篩選修正 8 小時時差（台灣凌晨的訂單在起始日當天篩不到）",
    "「立即寄送開課通知」名單改為已開通學員，並在寄出前先顯示人數與組成",
    "教室公告：置頂公告常駐在播放頁上方、提示條「查看」可直接開啟、手機下拉選單不再跑出畫面",
  ]},
  { date: "2026-09-13", tag: "行銷", title: "上架時程異動與免費試看頁", items: [
    "上架時程異動電子報分早鳥／一般兩版發送；後台電子報可存多份草稿、新增寄送成效面板（送達、開信、點擊）",
    "免費試看頁改版：一頁看完不用捲動、看到一半與看完各跳一次購買資訊，價格自動跟著官網波段變動",
    "教室逐章上架分層：一般學員 9/30 起開放第一到第三章、10/31 全部開放",
    "官網導覽列新增「課程試看」入口",
  ]},
  { date: "2026-09-09", tag: "功能", title: "Google 登入改自家按鈕 ＋ 營運助理週報", items: [
    "Google 登入改用站內按鈕，帳戶選擇畫面顯示 InRecord",
    "每週一自動產生營運週報（訂單、待開通、觀看、電子報、廣告），後台可看",
  ]},
  { date: "2026-09-08", tag: "行銷", title: "首頁留信箱換試看 ＋ 結帳二次確認", items: [
    "首頁與進站彈窗收集 Email 進潛客名單，並自動寄出免費試看影片連結",
    "結帳前增加訂單確認步驟與條款勾選（符合網路締約範本）",
  ]},
  { date: "2026-09-04", tag: "教室", title: "教室公告改版", items: [
    "儀表板最新公告區、播放頁鈴鐺與未讀提示；重要公告進教室先彈卡片",
  ]},
  { date: "2026-09-02", tag: "教室", title: "正式開課上線", items: [
    "教室開放、第一批學員開始觀看；電子報一鍵退訂上線",
    "開課當晚播放頁故障當天修復，並補上自動檢查與錯誤頁，避免同類問題再整頁崩潰",
  ]},
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
