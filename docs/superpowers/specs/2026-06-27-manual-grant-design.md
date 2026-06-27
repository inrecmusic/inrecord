# 後台「手動開通課程」設計

日期：2026-06-27

## 背景與問題

外部站台（concert-shop、WooCommerce 碩樂）成交後，會透過 webhook 把訂單寫進 InRecord `orders`（`source='concert'/'wordpress'`），後台「付款名單」面板可一鍵 `grantAccess()` 開通。

但 webhook 並非 100% 可靠（concert 端到端尚未完全驗證），會出現「concert-shop 那邊都齊了，但 InRecord 收不到、客人不在名單裡」的情況，導致無法替已付款客人開通課程。

需求：在後台新增「手動開通課程」入口，**直接輸入 Email（+ 電話）即可開通線上課程**，不依賴 webhook 名單。

## 技術前提（已驗證）

- 課程存取 = 登入者 email 在 `enrollments` 有 `course_id='piano-101'` 的列（`/api/classroom/verify-purchase` 比對 `user.email`）。**不需預建 auth 帳號** —— 客人之後用該 Email 登入（Google/Email OTP）即放行。
- 現成可重用：
  - `grantAccess(supabase, { id, email, plan })`（`lib/fulfillment-grant.js`）→ 建 `enrollments`（course/bundle）＋ `subscriptions`（game/bundle），皆冪等。
  - `sendPurchaseEmail({ email, plan, planLabel, merTradeNo })`（`lib/brevo-email.js`）→ 開課/購買確認信（`/api/admin/resend-email` 也用它）。
  - `verifyAdminToken(req)`（`lib/adminAuth.js`）。
- `orders` 欄位：`email`(NOT NULL)、`plan`(NOT NULL)、`amount`(NOT NULL，**無預設、須給值**)、`status`、`source`(default 'payuni')、`buyer_name`、`phone`、`access_granted_at`、`mer_trade_no`、`plan_label`、`email_error`。

## 方法

**建一筆 `source='manual'` 的 orders + 重用 `grantAccess()` + `sendPurchaseEmail()`。**
重用既有全部邏輯、有稽核紀錄、電話/姓名有地方存、客人自動出現在「學員管理」（students 合併 enrollments + 已付款 orders）。

## 功能規格

### UI

學員服務 →「付款名單」面板上方新增一張「✋ 手動開通」卡：

- Email（必填、type=email）
- 電話（選填）
- 姓名（選填）
- 方案：◉ 課程包（bundle，預設）／○ 只課程（course）
- ☑ 寄開課通知信（預設勾起）
- [開通] 按鈕；送出中 disable；完成後顯示結果（成功／已開通／寄信失敗提醒），並清空表單、刷新名單與學員列表。

### API：`POST /api/admin/manual-grant`

Body：`{ email, phone?, name?, plan: 'bundle'|'course', sendEmail: boolean }`

流程：
1. `verifyAdminToken` → 否則 401。
2. 驗證：`email` 必填且格式合法（用純函式 `normalizeManualGrantInput`）；`plan` 僅允許 `bundle`/`course`，其餘預設 `bundle`。
3. **防重**：查 `enrollments` 是否已有該 email + `piano-101`。
   - 已存在 → 不重複建訂單；回 `{ ok:true, alreadyGranted:true }`；若 `sendEmail` 仍可補寄信。
4. 建 1 筆 `orders`（純函式 `buildManualOrder` 產 payload）：
   `{ email, plan, plan_label, amount:0, status:'paid', source:'manual', buyer_name:name||null, phone:phone||null, payment_method:'manual', access_granted_at:now, mer_trade_no:'MANUAL-'+Date.now() }`
5. `grantAccess(supabase, { id: order.id, email, plan })`；任一錯誤 → 回 500 + errors（不留半開通：grantAccess 內部冪等，可重試）。
6. `sendEmail` 為真 → `sendPurchaseEmail({ email, plan, planLabel, merTradeNo })`；失敗 → `orders.email_error` 落地、回 `emailSent:false` + 提醒，但**開通仍算成功**。
7. 回 `{ ok:true, granted:true, alreadyGranted:false, emailSent:boolean }`。

### 純函式（可測，放 `lib/manual-grant.js`）

- `normalizeManualGrantInput({ email, phone, name, plan, sendEmail })`
  → `{ ok, error?, value:{ email(lowercased/trimmed), phone, name, plan, sendEmail } }`；email 空或格式錯 → `ok:false`。
- `buildManualOrder({ email, phone, name, plan, now })`
  → orders insert payload（如上）；`plan_label` = `課程包（手動開通）` / `課程（手動開通）`。

單元測試（vitest）：email 驗證（空/格式/大小寫正規化）、plan 白名單與預設、payload 欄位（amount=0、source/status、plan_label 對應、access_granted_at=now）。

### 對帳彙整調整

`lib/reconciliation.js` 的 `summarizeOrders` **排除 `source='manual'`**（手動開通非真實收款，amount=0 會混淆有效收款），並補一個對應測試。

## 客人登入動線

開通後，客人用該 Email 登入 `/classroom/login`（Google 或 Email OTP）→ `verify-purchase` 比對 `enrollments` 放行。**前提：客人登入的 Email 必須與開通的 Email 一致**（UI 上提示「請填客人實際登入用的 Email」）。

## 不做（YAGNI）

- 不做批次匯入（單筆表單即可）。
- 不做手動撤銷（已有訂單管理/退款流程處理）。
- 不預建 Supabase auth 帳號（非必要）。

## 測試與驗收

- `npm test`：`lib/manual-grant.test.js`、`lib/reconciliation` 新增案例通過。
- `next build` 通過。
- 後台實機：填 Email 開通 → enrollments/subscriptions 出現、學員管理出現該員、付款名單不顯示該筆（source=manual）、勾寄信時信件送出。
- 部署 Vercel prod 後驗證。
