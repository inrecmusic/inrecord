# 手機／平板 UI/UX 優化 — 階段② BuyModal 購買彈窗

**日期**：2026-06-13
**範圍**：`components/BuyModal.jsx` + `components/BuyModal.module.css`
**方向**：手機（≤640px）改底部抽屜（Bottom Sheet）；桌機/平板維持原本置中彈窗，視覺不變。

---

## 背景與目標

BuyModal 是手機下單的最後一哩路。目前彈窗為**垂直置中、無 max-height/捲動**，內容多（方案卡、優惠券、特色清單、開通帳號、3 個發票選項 + 條件輸入框、付款按鈕、備註）。在小手機上整個彈窗會超出視窗，頂部關閉鈕或底部「前往付款」可能被截掉、點不到。BuyModal CSS 目前**沒有任何 mobile media query**。

**目標**：手機把彈窗改為底部抽屜——內容可捲、付款鈕固定在底部常駐可點；解決溢出、提升拇指操作體驗；防 iOS 聚焦自動放大。桌機/平板維持原樣。

## 整體做法

所有手機行為集中在 `@media (max-width: 640px)`。需要在 JSX 把 `.box` 內容包成兩個 wrapper（捲動區 + 常駐底部），桌機上這兩個 wrapper 不設 overflow/max-height，排版與現狀**完全一致**（僅多兩層 div）。

## JSX 結構調整（`components/BuyModal.jsx`）

把 `.box` 內現有子元素分成兩組，包成兩個新 wrapper：

- `<div className={styles.sheetBody}>`：包含目前 `<h2>` 標題、`.sub`、`.planCard`、`.couponRow`、優惠券訊息、`.features`、`.account`、`.invoiceSection`、`verifyError`。
- `<div className={styles.sheetFooter}>`：包含 `.proceed` 按鈕、`error` 的 `.errorBox` + `.retry`、`.note`。

`<button className={styles.close}>`（關閉鈕）維持為 `.box` 的直接子（絕對定位，不進 wrapper）。

不更動任何狀態、事件處理、checkout/優惠券/發票驗證邏輯——純結構分組。

## CSS 設計（`components/BuyModal.module.css`）

### 桌機/平板（base，維持現狀）
- `.box` 維持 `width: min(520px,100%)`、`border-radius: 22px`、`padding: 32px`、置中。
- 新增 `.sheetBody`、`.sheetFooter` 為一般區塊（無 overflow、無 max-height、無特殊邊框），使桌機排版與現狀一致。

### 手機（≤640px，新增 media query）
- `.overlay`：`align-items: flex-end;`（貼底）、`padding: 0;`
- `.box`：`width: 100%; max-width: 100%; border-radius: 20px 20px 0 0; max-height: 92vh; padding: 0; display: flex; flex-direction: column; animation: sheetSlideUp .3s ease;`
- `@keyframes sheetSlideUp`：`from { transform: translateY(100%); } to { transform: translateY(0); }`
- 抽屜頂部 grab handle：用 `.box::before`（小灰條 `36×4px`、置中、`margin: 8px auto`）作為視覺把手。
- `.close`：手機定位微調確保仍可點（維持絕對定位 top/right，避開 grab handle）。
- `.sheetBody`：`flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 8px 20px 12px;`（可捲動內容區；`min-height: 0` 是 flex 子元素能正確捲動的必要條件）。
- `.sheetFooter`：`flex-shrink: 0; border-top: 1px solid #eef2f7; padding: 12px 20px calc(12px + env(safe-area-inset-bottom)); background: #fff;`（常駐底部）。
- `.box h2`：手機字級略收（如 22px）、頂部留出 grab handle 空間。
- `.invoiceInput`、`.couponInput`：手機 `font-size: 16px;`（防 iOS 聚焦自動放大）。
- 點擊區：`.close` ≥ 40px、發票選項維持現有 padding（已 ≥44px 高）。

## 驗收方式

`npm run dev` 後於 DevTools 檢視：
- **手機 375 / 390（含 iOS Safari 實機尤佳）**：點首頁「立即購買」開啟 BuyModal → 從底部滑上、上方圓角、有 grab handle；內容可捲動；「前往付款」固定在底部、捲動時始終可見可點；切換「手機條碼／公司統編」出現輸入框時仍可捲到、聚焦輸入框頁面不自動放大（16px）；底部不被 iPhone home bar 遮擋。
- **小手機 360**：抽屜不破版、付款鈕可點。
- **桌機 1280 / 平板 768**：BuyModal 仍為置中圓角彈窗，與改版前**無視覺差異**。

## 不在範圍

- 金流／優惠券／發票驗證的邏輯與後端（純前端佈局/樣式）。
- 其他頁面（classroom、login/success 等屬後續階段）。

## 風險與緩解

- **桌機回歸**：新增的 `.sheetBody`/`.sheetFooter` 在桌機為無樣式包裝層；完成後比對桌機彈窗無差異。
- **grab handle 與關閉鈕重疊**：handle 置中、關閉鈕靠右，錯開不重疊。
- **footer 遮擋內容**：`.box` 為 flex column、body `flex: 1` 捲動、footer `flex-shrink: 0`，footer 不會蓋住可捲內容。
