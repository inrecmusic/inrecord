# 設計：載具/統編事前驗證（A）＋ 開票失敗記錄與標示（B）

日期：2026-06-07
狀態：已核准（待寫實作計畫）

## 背景與問題

InRecord 結帳可填手機載具（手機條碼，CarrierType `3J0002`）或統一編號開立發票。目前：

- BuyModal（前端）與 `app/api/payuni/checkout/route.js`（後端）**只驗格式/檢查碼**，不驗載具/統編是否**真實存在**。
- 付款成功後 `app/api/payuni/notify/route.js` 呼叫 `createInvoice`；若 Amego 開立失敗（例如「載具號碼不存在」），目前是**靜默處理**：記 log、`invoice_no` 留 null、不中斷購買。後台 admin 只能靠發現 `invoice_no` 空白才知道。

實測證據：以不存在的手機條碼 `/ABC.123` 開立時，Amego 回 `3040132 載具號碼不存在`，發票未開出。

## 目標

- **A 事前驗證**：結帳前驗證載具/統編是否真實存在，無效則於 BuyModal 即時擋下；後端 checkout 再驗一次當保險。
- **B 開票失敗記錄與標示**：付款後若開票失敗，記錄失敗原因並在後台訂單列表明確標示，搭配既有「補開發票」按鈕處理。

## 既有可重用資產

- `app/api/admin/orders/route.js`：GET 列出所有訂單（含 `invoice_no`）。
- `app/api/admin/issue-invoice/route.js`：POST `{ id }` 手動補開發票（已存在、可重用）。
- `app/admin/page.jsx` 的 `OrdersPage`：已載入訂單、已有「補開發票」按鈕（`issueInvoice()` 呼叫 issue-invoice）。
- `lib/amego-invoice.js`：`createInvoice()` 與 Amego 簽章/呼叫慣例（md5(dataStr+time+appKey)）。

## A — 事前驗證

### A1. 驗證 lib + API
- 新增 `lib/amego-verify.js`：
  - `verifyCarrier(barcode)` → 呼叫 Amego「手機條碼查詢」API，回 `{ valid: bool, error? }`。
  - `verifyTaxId(taxId)` → 呼叫 Amego「統編公司名查詢」API，回 `{ valid: bool, name?: 公司名, error? }`。
  - 沿用 `amego-invoice.js` 的簽章慣例與 `AMEGO_*` 環境變數。
- 新增 `app/api/invoice/validate/route.js`（POST）：輸入 `{ type: "mobile" | "company", value }`，回 `{ valid, name?, error? }`，供前端即時呼叫。

⚠️ 實作前置：Amego 驗證端點字串在官方 doc（SPA）抓不到，需於實作時以測試探出正確 `/json/...` 端點與欄位（功能確認存在，見 invoice.amego.tw/info_detail?mid=74）。

### A2. BuyModal 即時驗證
- 手機條碼/統編欄位於失焦或按「購買」前：先做現有格式/檢查碼檢查（便宜的第一道），通過後呼叫 `/api/invoice/validate` 驗存在性。
- 無效 → 顯示紅字錯誤、擋住結帳；驗證進行中 → 顯示「驗證中…」並暫時禁用購買鈕。
- 統編驗證成功 → 以回傳公司名**自動帶入 `companyName`** 欄位。

### A3. 後端 checkout 保險
- `checkout/route.js` 於格式檢查後，對載具/統編再呼叫驗證 lib 確認存在性；無效回錯誤（如 `carrier_not_exist` / `tax_id_not_exist`）、不建單。

### 降級策略
- 若 Amego 驗證 API **本身連線失敗/逾時**（非明確「不存在」），**不擋結帳**（放行），由 B 的開票失敗機制兜底；只有明確判定「不存在」才擋。避免驗證服務當機導致無法結帳。

## B — 開票失敗記錄與標示

### B1. Schema
- `supabase-schema-invoice.sql` 與 Supabase：`orders` 新增 `invoice_error TEXT`（記最後一次開票失敗原因，成功時清空）。

### B2. notify
- `notify/route.js` 開票失敗時，將 `invoice_error` 寫入該訂單（原因/錯誤碼）。
- 開票成功時設 `invoice_no` 並把 `invoice_error` 清為 null。

### B3. issue-invoice（既有補開）
- 補開成功時一併把 `invoice_error` 清為 null。

### B4. 後台 OrdersPage UI
- 已付款、`invoice_no` 空、`invoice_error` 有值的訂單 → 顯示「開票失敗：<原因>」狀態，搭配既有「補開發票」按鈕。
- 側欄「訂單管理」項目加上**待補開（開票失敗）數量**小標記。

## 資料流

1. 結帳：BuyModal（格式 + 存在性驗證）→ checkout 後端再驗存在性 → 建立 pending 訂單。
2. 付款成功：notify → `createInvoice` → 成功（設 `invoice_no`、清 `invoice_error`）／失敗（寫 `invoice_error`）。
3. 後台：admin 看到開票失敗訂單 → 按「補開發票」→ issue-invoice 成功 → 清 `invoice_error`。

## 錯誤處理

- 驗證 API 明確回「不存在」→ 擋結帳（前端紅字、後端 4xx）。
- 驗證 API 連線錯誤/逾時 → 放行結帳（不因驗證服務當機擋下交易）。
- 開票失敗 → 不中斷購買（維持現狀），但記錄 `invoice_error` 供後台補救。

## 測試

- A：
  - 手機條碼 `/AHDCYW4`（真實）→ valid。
  - 手機條碼 `/ABC.123`（不存在）→ invalid、BuyModal 擋下、checkout 回錯誤。
  - 統編 `12345675`（合法）→ valid 並回公司名（自動帶入）。
- B：
  - 製造一筆開票失敗（例如繞過 A 用不存在載具，或暫時用無效輸入）→ notify 寫入 `invoice_error` → 後台 OrdersPage 顯示「開票失敗」→ 按補開成功 → `invoice_error` 清空。
- 測試一律用 sandbox／測試 email，測畢作廢發票並清除測試資料（沿用本專案測試慣例）。

## 範圍外（YAGNI）

- 開票失敗自動重試、失敗 Email 通知 admin（之後需要再加）。
- 捐贈碼驗證（目前無捐贈碼流程）。
