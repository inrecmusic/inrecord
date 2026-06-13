# 訂單對帳報表 — 期間財務彙整（設計）

> 日期：2026-06-13　範圍：後台「訂單管理」頁，依日期區間顯示期間財務彙整 + 匯出對帳 CSV。
> 形式：複用 OrdersPage 既有日期篩選與已載入訂單，純前端彙整（無新後端 API）。

## 問題

後台已有：總/本月營收（Dashboard）、OrdersPage 的總營收、付款/退款/待處理筆數、訂單明細 CSV、日期+狀態篩選。缺一份「**選定期間**」的完整財務彙整：營收 vs 退款、付款方式分佈、發票開立狀況、優惠折抵，以及可匯出的對帳 CSV。

## 目標

OrdersPage 加「對帳彙整」面板：依**日期區間**（沿用既有 `dateFrom`/`dateTo`）算出期間彙整並可匯出，幫助對帳與記帳。

## 金額語意（關鍵）

訂單為**單一狀態**（`pending`→`paid`→退款後變 `refunded`）。退款訂單已不在 `paid`，故：

- **有效收款 = 已付款（status=paid）金額合計**（退款者已自動排除）
- **退款金額** 另列為資訊（該期間退還多少），**不做 `paid − refund` 相減**（會重複扣）

## 元件

### 1. `lib/reconciliation.js`（新，純函式）

```
summarizeOrders(orders, catalog) → {
  paid:      { count, amount },          // status==="paid"
  refunded:  { count, amount },          // status==="refunded"
  pending:   { count },                  // status==="pending"
  byPayType: { [payType]: { count, amount } }, // 僅 paid，依 pay_type 分組（空值歸「未知」）
  invoice:   { issued, missing },        // 僅 paid：有/無 invoice_no 的筆數
  coupon:    { count, discount },        // 僅 paid 且有 coupon_code：筆數 + Σ(原價−實付)
}
```

- `orders`：物件陣列，欄位用 `{ status, amount, pay_type, invoice_no, coupon_code, plan }`
- `catalog`：`PLAN_CATALOG`（`lib/plans.js`），用於折抵：`discount += (catalog[plan]?.price ?? amount) − amount`（無對應方案則折抵 0）
- 金額一律 `Number(amount)||0`；純函式、不讀 env、不丟例外 → 可單元測試

### 2. `lib/reconciliation.test.js`（新）

涵蓋：混合狀態金額/筆數正確、付款方式分組（含未知）、發票已開/未開計數、優惠折抵金額、空陣列回零值。

### 3. `app/admin/page.jsx` OrdersPage（改）

- 新增 `dateFiltered` memo：`allOrders` **只套日期區間**（`dateFrom`/`dateTo`，忽略 `statusFilter`/`search`，確保營收與退款都涵蓋）
- `const report = summarizeOrders(dateFiltered.map(原始欄位), PLAN_CATALOG)`
  - 注意：`allOrders` 是 UI 映射後物件；彙整需要原始 `pay_type/invoice_no/coupon_code/plan/status/amount`。實作時讓 `allOrders` 映射保留這些欄位（已有 status/amount/method；補 `payType/invoiceNo/couponCode/plan`），或直接以 `rows`（原始）依日期篩選後傳入 `summarizeOrders`。**採後者：另用 `rows`（原始）做日期篩選傳入**，避免欄位轉換落差。
- 渲染「對帳彙整（依日期區間）」面板（StatCards 之後、訂單表格 panel 之前；若有「待處理告警」面板則排其後）：
  - 期間文字（`dateFrom`~`dateTo`，皆空顯示「全部期間」）
  - 有效收款（已付款）金額 + 筆數、退款金額 + 筆數、待付款筆數
  - 付款方式分佈（逐列：方式、筆數、金額）
  - 發票：已開 / 未開 筆數
  - 優惠折抵：使用優惠券筆數 + 折抵總額
- 「匯出對帳 CSV」按鈕（與既有「匯出 CSV（明細）」並列，兩顆分開）：輸出彙整指標（指標,值）+ 付款方式分佈列；沿用既有 `esc`（公式注入防護）+ BOM 寫法

## 資料流

OrdersPage 已 `loadOrders()` 載入全部 `rows` → 依 `dateFrom/dateTo` 篩出期間訂單 → `summarizeOrders(rows期間, PLAN_CATALOG)` → 面板渲染 + CSV 匯出。改日期篩選即時更新報表與表格。

## 錯誤處理

- 期間無訂單：各值為 0、面板照常顯示零值
- `amount` 非數字：`Number()||0`
- `plan` 不在 `PLAN_CATALOG`：該筆折抵以 0 計

## 測試（`lib/reconciliation.test.js`）

- 混合 paid/refunded/pending：各 count/amount 正確、有效收款不含退款
- `byPayType`：依 pay_type 分組（含 null→「未知」）僅計 paid
- `invoice`：paid 中 issued/missing 計數
- `coupon`：有 coupon_code 的 paid 折抵 = Σ(原價−實付)
- 空陣列 → 全零

## 範圍外（YAGNI）

- 不做 PAYUNi 撥款對帳（無外部撥款資料）
- 不做按月趨勢表（Dashboard 已有趨勢圖）
- 不新增後端 API（複用 OrdersPage 已載入訂單）
- 不改既有「訂單明細 CSV」與篩選
