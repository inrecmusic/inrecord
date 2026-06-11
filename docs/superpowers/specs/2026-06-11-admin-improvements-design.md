# 後台改善設計（5 項）

日期：2026-06-11
狀態：已核准設計，待實作計畫

## 背景

後台功能皆已實作、無半成品。盤點後找出 5 項真實隱患與優化點，依重要性處理。5 項彼此獨立，放在同一份 spec，但實作計畫拆成 5 個獨立任務組（可分別執行/驗收）。

現況關鍵事實（影響設計）：
- **儀表板 `DashboardPage`、銷售分析 `AnalyticsPage` 需要「全部訂單」**來算圖表/統計（前端全載 `orders` 後 `.filter`）。因此訂單**不能**做傳統伺服器分頁，否則分析數字會偏低。
- `/api/admin/orders`、`/api/admin/subscriptions` 目前 `select("*")` 不分頁 → PostgREST 預設單次最多回 **1000 列**，累積破千會被**靜默截斷**（漏單、分析失真）。`/api/admin/leads` 已有 `page/per_page` 伺服器分頁。
- 開發票／退款用瀏覽器原生 `alert()`（`app/admin/page.jsx` 約 743、744、745、756、757、758 行），其餘用精緻的 `showToast`。
- 序號庫展開批次會列出整批（最多 500 張）所有碼，無篩選/搜尋/分頁，且看不到「序號被誰兌換」。
- `.tableWrap { overflow-x:auto }` 已存在；側欄在 `@media (max-width:960px)` 變成換行橫列（堪用但笨重），無漢堡抽屜。

---

## ① 清單抓取上限（防漏單）+ 訂單表格搜尋/分頁

### 伺服器：共用分頁撈取 helper
新增 `lib/supabase-paginate.js`：

```
selectAll(supabase, table, buildQuery?) → Promise<rows[]>
```
- 以每頁 `PAGE = 1000` 用 `.range(from, to)` 迴圈累積，直到某頁回傳列數 < PAGE 為止。
- `buildQuery(q)` 可選，讓呼叫端加 `.select()/.order()/.eq()` 等；預設 `select("*")`。
- 任一頁 error 即 throw。
- 純邏輯（注入假 supabase）可單元測試。

套用：
- `/api/admin/orders` GET：`selectAll(sb, "orders", q => q.select("*").order("created_at",{ascending:false}))`。
- `/api/admin/subscriptions` GET：同模式（遊戲存取頁全載）。
- `/api/admin/leads` **維持現有伺服器分頁不動**。

### 前端：訂單表格搜尋 + 分頁（資料仍全載）
`OrdersPage`（`app/admin/page.jsx`）：
- 保留 `orders` 全載（圖表/分析需要）。
- 新增 state：`q`（搜尋字串）、`tablePage`（目前頁，預設 1）、`PER=20`。
- 過濾：`email`、`mer_trade_no`、`status` 做不分大小寫子字串比對。
- 顯示：過濾後切 `PER` 筆分頁，底部「上一頁／下一頁／第 X / Y 頁」。
- 搜尋字串變動時 `tablePage` 重設為 1。

---

## ② alert → toast

- `app/admin/page.jsx` 把 `showToast` 傳進 `OrdersPage`（目前 render 為 `<OrdersPage leads={leads}/>`，改 `<OrdersPage leads={leads} showToast={showToast}/>`，並在 `function OrdersPage({ leads })` 加入 `showToast`）。
- 將開發票/退款的 4 處 `alert(...)` 改為 `showToast(...)`，文案沿用既有字串（✅/❌ 開頭）。
- 不改動開票/退款的後端邏輯。

---

## ③ 序號庫優化

### codes API 加兌換反查
`app/api/admin/coupon-batches/[id]/codes/route.js` GET：
- 取得該批 codes 後，查 `orders`：`.in("coupon_code", codeList).eq("status","paid")`，取 `coupon_code, email, fulfilled_at, created_at`。
- 組 map：code → `{ email, at: fulfilled_at || created_at }`。
- 每筆回傳擴充為 `{ id, code, used, redeemedEmail, redeemedAt }`（未兌換則為 null）。
- 一張碼限用一次，正常只會對到一筆；若多筆取最早。

### 展開批次 UI（`CouponsPage`）
- 篩選頁籤：**全部 / 未使用 / 已使用**（前端對 `expandCodes` 過濾）。
- 序號**搜尋框**：對 code 子字串過濾。
- 已用的碼 chip 顯示 `已使用 · {email} · {YYYY-MM-DD}`。
- 大批次前端分頁：預設顯示前 60 筆，下方「顯示更多（+60）」累加。
- 「全選複製 / 下載 CSV」維持**整批**（不受篩選/分頁影響），避免誤以為只匯出部分；CSV 加一欄「兌換人」。

### 批次列表
- 加搜尋框：對批次 `name`、`prefix` 子字串過濾。

---

## ④ 強化既有訂單 CSV 匯出

校正（2026-06-11）：細讀 `OrdersPage` 後確認**搜尋（學員／email／訂單號）、狀態篩選、日期區間篩選、CSV 匯出皆已存在**（`exportOrders` 匯出過濾後結果）。故 ④ 縮減為強化既有 CSV 的一個小缺陷：

- 現有 `exportOrders`（`app/admin/page.jsx` 約 790-798 行）產生的 CSV **無 BOM**（Excel 開啟中文亂碼）、**無公式注入防護**。
- 修正：CSV 字串前加 UTF-8 BOM `﻿`；每格 esc 套用與序號庫相同的公式注入防護（`=+-@\t\r` 開頭前綴單引號並整欄加引號）。
- 匯出範圍維持現狀（目前過濾後的訂單）。
- 不重做已存在的搜尋/篩選/匯出鈕。

---

## ⑤ 完整 RWD

### 手機側欄抽屜
- `page.jsx`：新增 `navOpen` state；topbar 加漢堡鈕（≤960 顯示）。點選導覽項目後自動關閉抽屜。
- `admin.module.css`：
  - `@media (max-width:960px)`：側欄改為固定定位的滑入抽屜（`transform: translateX(-100%)`，`navOpen` 時 `translateX(0)`），加半透明遮罩；移除現有「換行橫列」寫法。
  - 漢堡鈕僅 ≤960 顯示，≥961 隱藏。

### 其餘 RWD 細節
- `.modalCard` 在 `@media (max-width:600px)` 改近全寬（`width:100%`、留小邊距）。
- 表格 `.tableWrap` 補 `-webkit-overflow-scrolling:touch`；`.table` 設 `min-width` 保欄位可讀（橫向捲動）。
- 驗證 stat grid／圖表在既有 breakpoint 已正確堆疊（已有 `@media 1200/700/480`）。

---

## 測試策略

- `lib/supabase-paginate.js` 的 `selectAll` 分頁迴圈：vitest 注入假 supabase（回傳分頁資料），驗證「跨頁累積」「最後一頁不足 PAGE 即停」「error 拋出」。
- 路由（orders/subscriptions/codes）、UI（OrdersPage/CouponsPage）、CSS RWD：依現有慣例手動驗證 + `npm run build`。

## 部署

- 無 DB schema 變更（純程式）。
- 部署沿用：`git push`（目前 GitHub 403 待解）+ `npx vercel --prod`。

## 不做（YAGNI）

- 不對訂單做伺服器分頁（與分析全載需求衝突）。
- 不另開獨立「兌換紀錄」頁（核銷反查內嵌於序號庫即可）。
- 不改動金流／開票／退款後端邏輯，僅換前端提示。
