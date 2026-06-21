# 課程 Demo 體驗頁（AI 遊戲試玩）— 設計文件

- 日期：2026-06-21
- 狀態：設計定案，待寫實作計畫
- 相關：金流暫緩改 WordPress（見記憶 project-inrecord-payment-pivot）

## 1. 目標

把首頁 hero 的「免費試看」與導覽列「課程試看」改成**跳轉到獨立的課程 Demo 體驗頁**。Demo 內容是**公開的 AI 遊戲試玩**（不需登入），帶**常態出現的 CTA 按鈕**與**2 分鐘試玩倒數**；倒數結束後鎖住畫面並彈出 CTA pop up，引導去 **WordPress 預購頁**。

目的：用「可玩的 AI 遊戲」當鉤子，提升轉換到預購。

## 2. 範圍

**做：**
- 新增公開路由 `/demo`（無需登入）。
- hero「免費試看」、導覽列（桌機 + 手機）「課程試看」三處改為連到 `/demo`。
- 移除現有影片試看 `PreviewModal`（含其 Email 名單捕捉）。
- 內嵌一個**專用 demo 遊戲**（靜態 HTML，與付費內容隔離）於 sandbox iframe。
- 2 分鐘倒數、常態 CTA、結束鎖住 + CTA pop up。
- CTA 指向 WordPress 預購頁（外部連結，URL 由環境變數提供）。

**不做（YAGNI）：**
- 後台管理 demo 遊戲（用靜態檔，開發者更新）。
- 防濫用持久化（倒數**不防**重整，重整即可重玩）。
- 多個 demo 遊戲輪播、demo 浮水印、登入/訂閱驗證。
- 任何站內金流（金流已暫緩、改 WordPress）。

## 3. 路由與存取

- 新增 `app/demo/page.jsx`：公開頁，**不需登入、不需訂閱**。
- 直接靜態渲染（client component，因有倒數計時器與互動）。

## 4. 入口改動（`app/page.jsx`）

| 位置 | 現況 | 改為 |
|------|------|------|
| hero「免費試看」按鈕（約 line 563-564） | `onClick → setPreviewOpen(true)` | 連到 `/demo`（`next/link` 或 router.push）|
| 導覽列「課程試看」桌機（約 line 476） | `setPreviewOpen(true)` | 連到 `/demo` |
| 導覽列「課程試看」手機選單（約 line 493） | `setMenuOpen(false); setPreviewOpen(true)` | 關選單 + 連到 `/demo` |

連帶移除：`previewOpen` state、`onPreviewSuccess`、`<PreviewModal .../>`（line 844）、`import PreviewModal`（line 16）。

## 5. 移除 PreviewModal（注意事項）

- 刪除 `components/PreviewModal.jsx` 與 `components/PreviewModal.module.css`。
- `PreviewModal` 元件**僅** `app/page.jsx` 使用，移除安全。
- ⚠️ 區分：`app/admin/GamesManagePage.jsx` 內有同名的區域 state `previewModal`（後台遊戲預覽），**與本元件無關，不可動**。
- ⚠️ 影片試看 modal 原本附帶的 **Email 留名單（Brevo）會一起消失**。已與使用者確認可接受（轉換改走 WordPress）。

## 6. Demo 遊戲（與付費內容隔離）

- 靜態檔 `public/demo-game/index.html`（先放**佔位版**可玩 demo，之後替換成正式 demo 遊戲）。
- 於 `/demo` 用 `<iframe src="/demo-game/index.html" sandbox="allow-scripts">` 載入。
- **完全不碰** `games` 資料表、不經 `/api/classroom/games`，付費遊戲內容零外露。
- 佔位版內容：簡單可互動的鋼琴/節奏小遊戲（純前端 HTML/JS/CSS），證明流程可跑。

## 7. 版面與視覺（v4 定案：白底 · 藍色強調 · 些許終端機）

- 底色白 `#fff`；主文字 `#0f172a`、次要 `#64748b`；分隔線 `#eef1f5`。
- 強調色藍 `#2563eb`（淺底 `#eff6ff`、邊框 `#bfdbfe`）。
- **少量**終端機味：等寬字（`ui-monospace`）只用在倒數讀數與少數標籤；其餘維持一般字體。

**版面（試玩中）：**
```
┌ 頂部列（白）───────────────────────────────┐
│ InRec●rd            ▸ 01:47▌(藍,等寬,游標閃) [立即預購課程](藍鈕) │
├───────────────────────────────────────────┤
│  // ai_game · live demo  (左上 mono 灰標)                  │
│            [ AI 遊戲 iframe 試玩區 ]                        │
│            (淺底 #f8fafc + 淡藍點陣格)                      │
├───────────────────────────────────────────┤
│ 試玩 2 分鐘 · 預購完整版解鎖 全部 AI 遊戲 + 10 章節完整課程 │
└───────────────────────────────────────────┘
```

**版面（倒數結束）：** 遊戲區模糊 + 白色半透明遮罩；中央白色 pop up 卡（陰影 + 藍色強調）：
```
        ▸ trial_ended  (mono 藍小標)
        試玩結束！
        預購完整版，解鎖
        全部 AI 遊戲 + 10 章節完整課程
        [ 立即預購課程 → ]   (藍實心鈕)
        [ ↻ 重新試玩 ]       (白框鈕 → location.reload())
```

> CTA 文字維持「立即預購課程」，**按鈕內文字排版**於實作時細修（使用者備註）。

## 8. 倒數與結束行為

- 前端 120 秒倒數，顯示 `MM:SS`，**頁面載入即開始**。
- 倒數 > 0：iframe 可玩；常態 CTA 持續顯示於頂部列。
- 倒數 = 0：
  - iframe 加 `filter:blur` + `pointer-events:none`（鎖住）。
  - 蓋上白色半透明遮罩 + 中央 CTA pop up 卡。
  - pop up 兩鈕：**「立即預購課程 →」**（WordPress）、**「↻ 重新試玩」**（`location.reload()`）。
- **不做持久化**：重整即重置倒數、可重玩（使用者明確要的）。無 localStorage、無後端、無 IP 記錄。

## 9. CTA 目標（WordPress 預購）

- 環境變數 `NEXT_PUBLIC_WORDPRESS_BUY_URL`（佔位，URL 由使用者稍後提供）。
- 常態 CTA 與 pop up CTA 共用此 URL，**新分頁開啟**（`target="_blank" rel="noopener noreferrer"`）。
- 邊界：未設或為空 → CTA 顯示「即將開放」、停用（不連到死連結）。

## 10. 邊界情況

| 情況 | 處理 |
|------|------|
| `NEXT_PUBLIC_WORDPRESS_BUY_URL` 未設 | CTA 顯示「即將開放」且 disabled |
| `public/demo-game/index.html` 不存在 | iframe 顯示「Demo 即將上線」佔位（iframe onError 或先放佔位檔即可避免）|
| iframe 內遊戲腳本 | `sandbox="allow-scripts"`，不給 `allow-same-origin`，隔離主站 |
| 行動裝置 | 版面 RWD：頂部列換行/縮排，iframe 維持比例，pop up 滿版邊距 |

## 11. 受影響檔案

**新增：**
- `app/demo/page.jsx` — Demo 體驗頁（client component：倒數 + iframe + 常態 CTA + 結束 pop up）。
- `app/demo/demo.module.css` — 樣式（白底 + 藍 + 些許終端機）。
- `public/demo-game/index.html` — 佔位 demo 遊戲（純前端）。
- `lib/demo.js` — 純常數與純函式（`WORDPRESS_BUY_URL`、`TRIAL_SECONDS=120`、`formatTime(s)`、`buyUrlOrNull()`），供 `/demo` 元件與單元測試共用（對齊第 12 節測試）。

**修改：**
- `app/page.jsx` — 三處入口改連 `/demo`；移除 `PreviewModal` 相關（import、state、render）。

**刪除：**
- `components/PreviewModal.jsx`、`components/PreviewModal.module.css`。

## 12. 測試

- 倒數歸零 → pop up 出現、iframe 鎖住（元件測試 + fake timers）。
- CTA `href` = `NEXT_PUBLIC_WORDPRESS_BUY_URL`；未設定 → disabled「即將開放」。
- 「重新試玩」呼叫 reload（或重設倒數）。
- 純邏輯抽出可測：`formatTime(seconds) → "MM:SS"`、倒數遞減、`buyUrlOrNull()`。
- 入口：hero/導覽三處連到 `/demo`；確認移除 `PreviewModal` 後 build 無殘留引用。

## 13. 不做（重申 YAGNI）

後台管理 demo 遊戲、防濫用持久化、多 demo 遊戲、demo 浮水印、站內金流、登入/訂閱驗證。
