# 手機／平板 UI/UX 優化 — 階段③ 教室 classroom

**日期**：2026-06-13
**範圍**：`app/classroom/page.jsx`（淺色、inline-style、1047 行）
**方向**：聚焦高收益的手機化——課程目錄抽屜、手機/平板區分、播放器比例、觸控防放大。保留現有 inline-style 架構，不做重構。

---

## 背景與目標

教室是已付費學員的學習區。它的 RWD 不是用 CSS media query，而是整頁 inline style + 單一 `isTablet`（`window.innerWidth <= 1024`）旗標切換。問題：

1. 真手機（375）與 iPad（1024）吃到**相同版面**，沒有手機專屬優化。
2. 手機最大痛點：右側「課程目錄」（選單元）在 `isTablet` 時被塞到「播放器＋分頁的最下方」、限高 300px。手機上要換一課，得捲過整個播放器與分頁才摸得到——很不順。

**目標**：手機把課程目錄改為可隨時開啟的滑入抽屜、區分手機與平板、放大播放器、防 iOS 聚焦放大。桌機（>1024）維持不變。

> `classroom.module.css`（深色、201 行）目前**無人 import、為死檔**，本階段**不處理**（依使用者決定保留）。也不做 inline→CSS module 重構。

## 現況關鍵結構（`app/classroom/page.jsx`）

- 主 render 從第 718 行起，最外層 `<div>` 依 `isTablet` 切 `height/overflow`。
- 第 727 行有一個 `<style>{`...`}</style>` 全域樣式區塊（spin keyframe、box-sizing、scrollbar）。
- Body（792）：`flexDirection: isTablet ? "column" : "row"`。
- 左欄（800）：播放器（808，`paddingTop: "44%"`）、影片資訊列（854）、`<CommentsSection>`、分頁列（897）、分頁內容（922）。
- 右欄「課程目錄」（930）：`width: isTablet ? "100%" : 288`、`maxHeight: isTablet ? 300 : "none"`、進度條 + 章節/單元清單。
- 既有狀態：`isTablet`（513，`setIsTablet(window.innerWidth <= 1024)`，resize 監聽）。
- 選單元：`handleSelect(v)`（單元按鈕 onClick，989 行）。

## 設計與改動

### 1. 新增 `isPhone` 旗標
在 `isTablet` 的同一個 resize effect（約 513–518 行）內，新增 `const [isPhone, setIsPhone] = useState(false);`，`check` 內加 `setIsPhone(window.innerWidth <= 640);`。`isTablet`（≤1024）維持不變。語意：
- `isPhone`（≤640）：手機，課程目錄用抽屜。
- `isTablet && !isPhone`（641–1024）：平板，維持現況（目錄堆疊在下方、限高 300）。
- `!isTablet`（>1024）：桌機，維持現況（右側 288px 側欄）。

### 2. 課程目錄抽屜（手機 ≤640）
新增 `const [drawerOpen, setDrawerOpen] = useState(false);`

**右欄容器（930 行）依 isPhone 切換為抽屜**：
- 非手機：維持現有 inline style（桌機側欄 / 平板堆疊）。
- 手機：`position: fixed; top: 0; right: 0; bottom: 0; width: min(330px, 85vw); z-index: 50; box-shadow: -8px 0 32px rgba(0,0,0,.18); transform: drawerOpen ? "translateX(0)" : "translateX(100%)"; transition: transform .28s ease; maxHeight: none;`（覆蓋掉平板的 `maxHeight:300`、`width:100%`）。

**Backdrop（手機 + drawerOpen 時渲染）**：在右欄前插入一個 `<div>`，`position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 49;`，`onClick={() => setDrawerOpen(false)}`。僅 `isPhone && drawerOpen` 時渲染。

**開啟鈕（手機顯示，置於影片資訊列右側）**：在影片資訊列（854 區塊）右側、`isPhone` 時渲染一顆按鈕：「📚 課程目錄 {doneCount}/{totalCount}」，`onClick={() => setDrawerOpen(true)}`。非手機不顯示（維持原本的「已完成 / 觀看中 %」狀態顯示；手機則以目錄鈕取代或並存——以**取代**為準，避免資訊列在窄screen 過擠）。

**選單元自動關閉**：`handleSelect(v)` 內（或單元按鈕 onClick）在 isPhone 時呼叫 `setDrawerOpen(false)`，讓使用者選課後立即看到影片。

**抽屜頂部關閉**：抽屜內進度列右側（或頂部）加一顆 `✕` 關閉鈕（`setDrawerOpen(false)`），手機才顯示，確保不靠 backdrop 也能關。

### 3. 播放器比例（手機放大）
播放器容器（810 / 825 / 835 的 `paddingTop: "44%"`）改為 `paddingTop: isPhone ? "56.25%" : "44%"`（手機 16:9，影片更大）。三處 `paddingTop` 皆改。

### 4. 觸控防放大（手機輸入框 16px）
在第 727 行既有 `<style>` 區塊內，新增一條：
```css
@media (max-width: 640px) {
  input, textarea, select { font-size: 16px !important; }
}
```
解決 iOS 聚焦自動放大（留言 textarea、作業、評價等輸入元件皆 inline-styled，用全域 media 規則一次涵蓋）。

## 驗收方式

`npm run dev` 後，DevTools 響應式（登入已購買帳號進入 `/classroom`）：

- **手機 375 / 390**：影片資訊列右側出現「📚 課程目錄 x/y」鈕 → 點擊抽屜從右滑入、有 backdrop；點某單元 → 抽屜關閉並切換影片；點 backdrop 或 ✕ → 關閉；播放器為 16:9（比改版前高）；聚焦留言/作業輸入框時頁面**不自動放大**。
- **小手機 360**：抽屜寬度 85vw 不破版、可捲動章節清單。
- **平板 768 / 1024**：維持現況（目錄堆疊在播放器+分頁下方、限高 300），**不出現抽屜鈕**。
- **桌機 1280**：維持現況（右側 288px 固定側欄），與改版前無差異。

## 不在範圍

- 死檔 `classroom.module.css`（保留不動）。
- inline style → CSS module 重構、主題/配色調整。
- login/success 等其他頁面（後續階段）。

## 風險與緩解

- **抽屜 z-index 衝突**：topbar z-index 用 inline 無特別高值；抽屜 50 / backdrop 49 高於內容即可；分頁列 sticky z-index 10，低於抽屜，無衝突。
- **resize 邊界**：在 641 上下切換時抽屜 `drawerOpen` 殘留 → 平板/桌機不渲染 backdrop、右欄非 fixed，殘留狀態無視覺影響；可選在 `!isPhone` 時忽略 drawerOpen（右欄樣式只在 isPhone 套 fixed/transform）。
- **桌機/平板回歸**：所有抽屜樣式僅在 `isPhone` 分支套用；641–1024 與 >1024 走原本 inline style，完成後比對無差異。
