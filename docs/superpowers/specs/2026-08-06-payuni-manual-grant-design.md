# 官網直購改「不自動開通、寄預購信、後台手動開通」設計

- 日期：2026-08-06
- 狀態：設計已核可，待寫實作計畫
- 相關：`lib/order-fulfillment.js`（AUTO_INVOICE 開關同款）、`app/api/payuni/notify/route.js`、`lib/fulfillment-grant.js`、`lib/manual-grant.js`、`app/admin/page.jsx`

## 背景與目標

InRecord 其他銷售管道（商品頁）採「付款 → 寄預購成功信 → 先不開通、由人工開通」。本案讓**官網 PAYUNi 直購一致**：付款成功後**不自動開通課程**，寄預購成功信，訂單進後台由賣家**手動開通**。

**動機**：① 與既有銷售流程一致；② 賣家掌控每一筆開通（與 2026-08-06 剛上線的「發票人工開立」同精神）。

## 現況（探索結論）

- **notify**（`app/api/payuni/notify/route.js`）付款成功後：① `grantAccess()`（`lib/fulfillment-grant.js`）寫 `enrollments`／`subscriptions` 開通；② 一次性履約（Meta CAPI Purchase、優惠券累計、`sendPurchaseEmail`）；③ 開發票（已於 2026-08-06 加 `AUTO_INVOICE` 開關、預設關）。
- **信件** `sendPurchaseEmail`（`lib/brevo-email.js`）依 `presale` 切文案：`true`＝「預購成功、開課後 Email 通知」（移除登入按鈕）；`false`＝「購買成功、課程已開通」。notify 現以 `isPresale(鎖站)` 判斷。
- **教室鎖站**（`middleware.js`）鎖站期間一律把 `/classroom` 訪客 `307` 轉首頁（**不看開通狀態**），`open_at`（現 9/2）到才解鎖。→ 「提前上課」已被擋。
- **後台手動開通基礎已存在**：`lib/manual-grant.js`（`buildManualOrder`：`granted` 決定 `status` paid/notified＋`access_granted_at`）、`/api/admin/manual-grant`、`/api/admin/grant-access`、admin「✋ 手動開通／補寄信」表單＋「外部站台付款名單」批次「寄預購信／開通」＋開通狀態顯示（`enrolled ? 已開通 : 未開通`）。
- `runLaunchNotify`（`lib/launch-notify.js`）開課日**只寄開課信、不開通**。
- **開通判斷**靠 `enrollments` 有無該 email 記錄（`hasCourseAccess`）。

## 需求

官網直購（`source=payuni`）付款成功：
1. **不自動開通課程**（一律，不分預購／開課後）
2. 寄「**預購成功**」信
3. 訂單進後台付款名單、標「**未開通**」
4. 後台**手動開通**（逐筆＋批次）

## 設計

### A. notify 不自動開通（fail-safe 開關）

- 新純函式 **`autoGrantEnabled(env = process.env)`**（`lib/order-fulfillment.js`，與 `autoInvoiceEnabled` 並列）：`env.AUTO_GRANT_ACCESS === "on"` 才自動開通；**未設＝關**。
- notify 的 `grantAccess` 段（route.js 約 L120–127）包進 `if (autoGrantEnabled() && order.email) { … }`。開關 off → **跳過** `grantAccess`（不寫 enrollments／subscriptions）。
- **其他履約不變**：訂單轉 `paid`、Meta CAPI Purchase、優惠券累計、寄信照常（付款成功的事實與追蹤不受影響）。
- **fail-safe**：未設 `AUTO_GRANT_ACCESS` ＝不自動開通（現狀即關）。日後要恢復自動開通 → Vercel 設 `AUTO_GRANT_ACCESS=on`、免改程式。

### B. 信件一律「預購成功」文案

- notify 寄 `sendPurchaseEmail` 時，開關 off（不自動開通）→ `presale` **一律 `true`**（「預購成功、開通後 Email 通知」），不管鎖站與否——因為開通改人工、信不能說「已開通」。
- 實作：`presale: !autoGrantEnabled() ? true : isPresale(saleSettings, now)`。

### C. 後台付款名單開通入口

- 訂單管理「付款名單」顯示每筆訂單**開通狀態**（已開通／未開通，靠 `enrollments` 判斷）。
- 對 `source=payuni`、`status=paid`、**未開通** 的訂單，提供「**開通課程**」動作：**逐筆按鈕 ＋ 批次選取開通**。
- 開通 ＝ 沿用 `grantAccess`（`lib/fulfillment-grant.js`，與現有手動開通同源、冪等），開通後可寄「開通／開課」信。
- 對接現有 `/api/admin/grant-access`（視需要擴充批次）。
- 賣家提示：付款名單頂部顯示「待開通 N 筆」，避免漏開。

### D. 範圍

- **只 `source=payuni`（官網直購）**。concert 導流（`/api/webhook/concert` 自有開通）、`manual`（後台手動）**不受開關影響**——開關只 gate notify 內的 `grantAccess`。

### E. 測試

- `autoGrantEnabled` 純函式（`on` / 未設 / 其他值 / undefined）。
- notify：開關 off 時不 `grantAccess`、仍寄信（`presale=true`）、仍累計優惠券／送 CAPI；開關 on 時維持原行為。
- 後台開通動作（逐筆／批次）→ `grantAccess` 冪等。

## 不做（YAGNI）

- 不改 concert／manual 流程。
- 不做「開課日自動統一開通」（使用者選一律手動）。
- 不改教室鎖站（已擋提前上課）。
- 不做學員自助兌換。

## 風險與注意

- **fail-safe 預設關**：部署後官網直購立即改不自動開通。目前 `source=payuni` 近一個月零單、無在途訂單，安全。
- **漏開風險**：手動開通若漏開 → 買家付錢沒課上。以付款名單「未開通」標示＋「待開通 N 筆」提示降風險。
- 開通狀態判斷靠 `enrollments`；付款名單需正確 join／查詢。
- 與 `AUTO_INVOICE` 開關**獨立**（發票人工、開通也人工，兩開關分開控制）。
- 教室鎖站期間就算開通了也進不去（middleware 擋），開通主要意義在開課後可上課＋名單完整。
