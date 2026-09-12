# 金流資料保存（payment_events + 退款欄位）

2026-09-12 補上的四個資料保存缺口。**主線是「多留底」，不改任何既有分流**：notify 與 checkout 的行為
一字不變，新增的寫入全部是「失敗只記 log、不影響主流程」，SQL 沒跑也能安全降級。

---

## 一、新增了什麼

### 1. `payment_events` 表：PAYUNi 原始回呼全文落地

以前 `app/api/payuni/notify` 只處理「付款成功（`TradeStatus=1`）」，而且只挑 4 個欄位寫回 `orders`
（`payuni_trade_no`、`pay_type`、`status`、`updated_at`）。其餘一律走到檔尾直接回 SUCCESS，什麼都沒留：

- **ATM／超商的「取號成功」通知整包被丟掉** —— 銀行代碼、虛擬帳號、繳費期限、超商繳費代碼全部沒存。
  要退 ATM 的款時，手上沒有學員的匯款資訊。
- 付款成功回呼裡的實際付款時間、卡號末四碼、授權碼也一併丟棄。
- 全庫沒有任何一張表存原始回呼。

現在：`lib/payment-events.js` 的 `recordPaymentEvent()` 在 notify **解密出參數之後、任何分流之前**
先寫一列，把整包參數原樣存進 `raw` jsonb。未來 PAYUNi 加任何欄位都自動被保存。

| 欄位 | 說明 |
|---|---|
| `mer_trade_no` | 我們的訂單編號（`INREC…`） |
| `payuni_trade_no` | PAYUNi 交易序號（`TradeNo`） |
| `trade_status` | `TradeStatus` 原值（`1`＝付款成功） |
| `pay_type` | `PaymentType`／`PayType` 原值 |
| `kind` | `paid`（付款成功）｜`code_issued`（ATM／超商取號）｜`other` |
| `raw` | **解密後的完整回呼參數**（虛擬帳號、繳費期限都在這裡） |
| `created_at` | 收到回呼的時間 |

> 刻意**沒有**唯一索引：同一筆訂單本來就會有多次回呼（取號 → 付款成功 → 重送），全部都要留。

### 2. `orders.refunded_at` / `orders.refund_amount`

以前退款只把 `status` 改成 `refunded`，退款時間只能靠 `updated_at` 推。但 `updated_at` 有 trigger，
退款後任何操作（補寄信、開發票、開通）都會蓋掉它 → 對帳會錯。現在退款當下直接寫這兩個專屬欄位，
`lib/sheets-sync.js` 同步到 Google 試算表時也優先取它們。

### 3. 退款不再讓開通紀錄消失

`app/api/admin/refund` 撤銷課程存取時仍會 `DELETE` enrollments（**不動 schema**，避免碰到存取檢查
那條關鍵路徑），但**刪除前先把整列 `select("*")` 起來**，連同金額、訂單編號、交易序號、付款方式
一起寫進 `admin_audit_log` 的 `meta`：

```
meta: { email, plan, method, mer_trade_no, payuni_trade_no, pay_type, amount,
        refunded_at, revoked_enrollment: <整列快照>, revoked_subscriptions: <筆數> }
```

正式庫已經因為舊版行為掉過一次資料（2026-08-23 的開通時間現在查不到），之後誤退／爭議要復原，
查稽核紀錄就有 `enrolled_at` 與 `early_override`。

### 4. checkout 的 `attribution` 白名單

`app/api/payuni/checkout` 以前原封不動吃前端傳來的整包 JSON 寫進 jsonb。現在比照
`app/api/newsletter/subscribe`，只收 `utm_source`／`utm_medium`／`utm_campaign`／`utm_term`／
`utm_content`／`fbclid`／`gclid`／`landing_path`／`referrer`／`captured_at`，每個值截 200 字，
非物件存 `null`。正常訂單的歸因欄位全在名單內，行為不變。

---

## 二、要跑哪支 SQL

**`supabase-payment-events.sql`**（idempotent，可重複執行）。在 Supabase SQL Editor 貼上整檔執行即可，
會建立 `payment_events` 表＋兩個索引＋service_role RLS policy，並對 `orders` 加上
`refunded_at`／`refund_amount` 兩欄。

---

## 三、沒跑 SQL 會怎樣（降級行為）

**不會有任何功能壞掉**，只是新資料沒留下來：

| 位置 | 沒跑 SQL 時的行為 |
|---|---|
| `notify` 落地回呼 | `recordPaymentEvent` 收到 `42P01`（表不存在）→ 只 `console.error` 提示要跑哪支 SQL 後 return。**付款、開通、寄信、開發票完全不受影響**，回呼照常回 SUCCESS。 |
| 後台退款 | 第一次帶 `refunded_at`／`refund_amount` 的 update 收到 `PGRST204`／`42703` → **自動退回只寫 `status` + `updated_at`**，退款照樣完成，log 提示要跑 SQL。**不會因為少欄位就退不了款。** |
| 同步到 Google 試算表 | `select` 撞到缺欄位 → 自動改用舊欄位組重撈，退款日期／金額退回以 `updated_at` 與訂單原金額推算（就是原本的行為）。 |
| enrollments 快照 | 與 SQL 無關（寫進既有的 `admin_audit_log`），一律生效。快照查詢失敗也只記 log，不中斷退款。 |

---

## 四、要退 ATM 學員的款，去哪裡找他的匯款資訊

ATM／超商是「代收」：學員匯到 PAYUNi 給的虛擬帳號，錢在 PAYUNi 那邊，**退款一律走 PAYUNi**
（後台「申請退款」按鈕，或 PAYUNi 商店後台）。需要學員的繳費資訊來核對時，到 Supabase SQL Editor：

```sql
-- 用訂單編號查該筆訂單的所有回呼（取號 → 付款成功，時間新到舊）
select created_at, kind, trade_status, pay_type, raw
from payment_events
where mer_trade_no = 'INREC1782785571389'
order by created_at desc;
```

**看每一列的 `raw`，不要只看 `kind`。** `raw` 是整包原樣保存，要找的資訊一定在裡面；
`kind` 只是方便分類的標籤，它依賴我們對 PAYUNi 欄位名的推測（`BankType`／`PayNo`／`ExpireDate`／
`CVSCode`／`Barcode*` 等），**尚未用真實的 ATM 回呼驗證過**。猜錯時該列會被標成 `other`，
但 `raw` 的內容不會少。

取號通知的 `raw` 裡通常找得到：代收銀行代碼、虛擬帳號或超商繳費代碼、繳費期限。
付款成功那一列的 `raw` 則是完整的付款回呼（含 PAYUNi 記的付款時間等所有欄位）。

> ⚠️ 還沒驗證過的前提：幕前付款流程下，PAYUNi 是否真的會為「ATM 取號」發一次背景通知。
> 要確認這個缺口真的補起來了，得開一筆真實的 ATM 訂單，確認 `payment_events` 有出現取號那一列。
> 在驗證之前，請仍以 PAYUNi 商店後台為準。

只知道 Email 時，先從 `orders` 查訂單編號：

```sql
select mer_trade_no, created_at, status, amount, pay_type
from orders
where email = 'xxx@example.com' or grant_email = 'xxx@example.com'
order by created_at desc;
```

> ⚠️ `payment_events` 只從「跑完 SQL 之後」收到的回呼開始累積，在那之前的舊訂單查不到取號資訊
> （那些資料當初就沒被存下來，只能到 PAYUNi 商店後台查）。

---

## 相關檔案

- `supabase-payment-events.sql` — 這批的唯一一支 SQL
- `lib/payment-events.js` — `classifyEvent()`（純函式分類）／`recordPaymentEvent()`（落地，絕不拋出）
- `app/api/payuni/notify/route.js` — 解密後、分流前呼叫 `recordPaymentEvent`
- `app/api/admin/refund/route.js` — 退款欄位＋快照＋稽核 meta
- `app/api/payuni/checkout/route.js` — `attribution` 白名單
- `lib/sheets-sync.js`、`app/api/admin/sheets-sync/route.js` — 試算表退款欄位（含降級）
