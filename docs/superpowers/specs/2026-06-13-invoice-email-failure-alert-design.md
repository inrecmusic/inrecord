# 開票／寄信失敗告警（設計）

> 日期：2026-06-13　範圍：付款成功後「開立發票」或「寄開課信」失敗時，主動通知管理員並讓失敗可查、可補救。
> 告警方式：主動寄信告警（push）+ 後台「待處理」面板（pull）。

## 問題

付款成功後 notify 會做兩件事：開發票（Amego）、寄開課信（Brevo）。目前：

- **開票失敗**：已存 `orders.invoice_error`、後台訂單以紅字顯示、有「已付款未開票」(`needInvoice`) 概念、可手動補開（`/api/admin/issue-invoice`）。但**無主動告警** —— 管理員不開後台就不知道。
- **寄信失敗**：**完全沒落地** —— `sendPurchaseEmail` 的結果只 `console.log`，沒有欄位記錄、後台看不到、無法補寄。漏寄＝客訴風險。

## 目標

1. 寄信失敗可查：落地 `orders.email_error`
2. 開票或寄信失敗時**主動寄 email 告警給管理員**（不必自己巡後台）
3. 後台集中顯示「待處理」訂單 + 補救動作（補開發票、補寄開課信）

## 告警去重決策

不新增去重旗標。理由：notify 對任何失敗仍回 `200 SUCCESS`（PAYUNi 不會重送）；履約區（寄信）有原子式 conditional claim 保護只跑一次；開票區僅在 `invoice_no` 為空時嘗試。因此告警自然只在「本次 notify 實際嘗試且看到失敗」時觸發約一次。手動補開／補寄走各自路由、不經 notify，不會觸發告警。低流量站台無需額外防重。

## 元件

### 1. 資料庫（`supabase-deploy.sql`，idempotent）

```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS email_error TEXT; -- 最後一次寄開課信失敗原因（成功時清為 null）
```

### 2. `lib/admin-alert.js`（新）

```
buildAdminAlertHtml({ kind, order, reason }) → { subject, html }   // 純函式，可測
sendAdminAlert({ subject, html }) → { success, skipped?, error? }  // Brevo 寄 ADMIN_EMAIL
```

- `kind`：`"invoice"` | `"email"`
- `buildAdminAlertHtml`：產生主旨與內文，含**訂單編號（mer_trade_no）**、**買家 email**、**失敗類型**、**失敗原因**，並提示「請到後台『待處理』面板處理」
- `sendAdminAlert`：收件人 `process.env.ADMIN_EMAIL`、寄件人 `BREVO_SENDER_EMAIL`/`BREVO_SENDER_NAME`；缺 `BREVO_API_KEY` 或 `ADMIN_EMAIL` → 回 `{ success:false, skipped:true }`；網路失敗回 `{ success:false, error }`。失敗不丟例外（呼叫端 try/catch 亦不中斷主流程）

### 3. `app/api/payuni/notify/route.js`（改）

- 寄開課信後：`await supabase.from("orders").update({ email_error: mailResult.success ? null : (mailResult.error || "send_failed") }).eq("id", order.id)`（`skipped` 視為 null，不算失敗）
- 開票區與寄信區各自記錄本次是否失敗（local 變數 `invoiceFailed` / `emailFailed`）
- notify 尾端（回 SUCCESS 前）：若 `invoiceFailed` 或 `emailFailed`，分別 `sendAdminAlert(...)`（包在 try/catch，失敗只 console.error，不影響回應）
- 不改動既有開通／優惠券／開發票邏輯與回應碼

### 4. `app/api/admin/resend-email/route.js`（新，比照 `issue-invoice`）

- `verifyAdminToken` → 401
- 取 `orders`（id, email, plan, plan_label, mer_trade_no）→ 404
- `sendPurchaseEmail({ email, plan, planLabel, merTradeNo })`
- 成功：`update({ email_error: null })` 回 `{ ok:true }`；失敗：`update({ email_error })` 回 `{ error }` 500

### 5. 後台「待處理告警」面板（`app/admin/page.jsx` OrdersPage）

- 從已載入的 orders 篩出「需處理」：`status==="paid"` 且（`invoice_error` 有值 **或** 無 `invoice_no`（待補開）**或** `email_error` 有值）
- 面板放 OrdersPage 頂部，**僅在有待處理項時顯示**（紅／橘底卡片）
- 每列：訂單編號、email、失敗原因（開票失敗／待開票／寄信失敗）、動作鈕
  - **補開發票**：沿用既有 `/api/admin/issue-invoice` + 既有 toast/重整模式
  - **補寄開課信**：呼叫新 `/api/admin/resend-email` + toast
- 沿用既有 admin 樣式與 toast；不另做新元件庫

### 6. 測試（`lib/admin-alert.test.js`）

- `buildAdminAlertHtml({ kind:"invoice", ... })`：subject/html 含訂單編號、email、原因、且標示「發票」
- `buildAdminAlertHtml({ kind:"email", ... })`：標示「開課信」
- 缺欄位（order 無 mer_trade_no）：以合理預設（如 "-"）不丟例外

## 資料流

付款成功 notify → 開發票 / 寄信 →（任一失敗）→ 落地 `invoice_error`/`email_error` + 寄 admin 告警 → 管理員收信 → 後台「待處理」面板 → 補開票 / 補寄信 → 對應 error 欄位清為 null、項目自面板消失。

## 錯誤處理

- 告警寄送失敗：只 `console.error`，不影響 notify 回應（付款開通優先）
- 缺 `ADMIN_EMAIL`/`BREVO_API_KEY`：`sendAdminAlert` 回 `skipped`，notify 照常
- 補寄信失敗：回 500 + 更新 `email_error`，面板保留該項

## env

沿用既有 `ADMIN_EMAIL`、`BREVO_API_KEY`、`BREVO_SENDER_EMAIL`、`BREVO_SENDER_NAME`。無新增 env。

## 範圍外（YAGNI）

- 不做定時掃描 / 排程告警
- 不做告警去重旗標
- 不做多通道（Slack/SMS/Webhook）
- 不改既有開票去重（`invoice_no`）與履約去重（`fulfilled_at`）邏輯
