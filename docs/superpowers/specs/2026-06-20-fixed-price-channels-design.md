# 指定價通路（Sub-2）— 設計文件

> 日期：2026-06-20　狀態：設計定案，待寫實作計畫
> 前置：建立在 Sub-1「多波段價格排程」之上（`lib/sale.js` 的 `currentPrice`/`isOnSale`、checkout 的 `not_on_sale` 防呆、首頁三態）。**Sub-2 實作於 Sub-1 合併進 master 後、從更新的 master 開分支進行。**

## 1. 背景與目標

上市活動有兩個**特殊通路**，價格固定、不隨波段變動：

- 🎪 **現場限定 $2,500**（課程包）—— 現場場次（6/27、7/8、8/6）發**序號卡**，線上兌換。
- 🎯 **粉絲限定 $3,499**（課程包）—— 曾購票／專輯／樂譜者，**人工驗證後發序號**（一人一序號），9/3 截止。

兩者都是「**指定成交價**」：覆蓋當下波段／牌價。現有優惠券是「折扣」（percent/fixed），無法設定絕對成交價，故新增 `type='price'` 券型，並讓指定價碼**全程可用**（含公開開賣前的「即將開賣」期）。

## 2. 範圍

**包含**
1. 優惠券新增 `type='price'`（指定成交價）＋ `plan` 鎖定欄。
2. `applyCoupon`/`couponError` 支援 price 型與方案鎖。
3. checkout：方案鎖檢查 ＋ 有效指定價碼**繞過 `not_on_sale`**（pre_launch 放行）。
4. `/api/coupons/validate`：price 型折後價 ＋ 方案鎖檢查。
5. 首頁 pre_launch「輸入序號/優惠碼」兌換入口 ＋ BuyModal 未開賣模式（需套有效指定價碼才可結帳）。
6. 後台：優惠券表單支援 price 型＋方案；序號庫批次支援產生 price 序號。

**不包含（YAGNI）**
- 粉絲身分**自動**驗證（採人工驗證→發序號，無驗證程式）。
- 指定價券與其他券**疊加**（指定價即最終價，不疊加）。
- 課程單賣的指定價（通路皆 bundle；`plan` 鎖定即可，未來要 course 再設）。

## 3. 已確認決策

| 項目 | 決定 |
|------|------|
| 機制 | 擴充現有 coupons：`type='price'`（`value`＝成交價）＋ `plan` 鎖定 |
| clamp | `applyCoupon` price 型回 `Math.min(value, 基準價)`（不會比當下價貴） |
| 方案鎖 | 指定價碼綁 `plan='bundle'`；用於他案 → `coupon_wrong_plan` |
| 開賣前 | **全程可用**：有效指定價碼繞過 `not_on_sale`；pre_launch 首頁加兌換入口 |
| 粉絲驗證 | 人工驗證→發碼，**無驗證程式** |
| 碼形式 | 兩通路皆**一人一序號**（序號批次，`usage_limit=1`） |
| 疊加 | 指定價券不與其他券疊加（單一最終價） |

## 4. 資料模型（`coupons` 擴充）

```
新增欄：plan TEXT（nullable）  -- 鎖定方案，例 'bundle'；NULL = 不限（沿用現有 percent/fixed 券）
type 既有 TEXT（'percent' | 'fixed'）→ 新增可用值 'price'（value = 指定成交價 NT$）
```
遷移（idempotent）：`ALTER TABLE coupons ADD COLUMN IF NOT EXISTS plan TEXT;`
（`type` 無 CHECK 約束，'price' 直接可用；同步更新 `supabase-schema-coupons.sql` / `supabase-deploy.sql` 的 coupons 區塊註解與欄位。）

序號庫（`coupon_batches`）沿用：每序號＝一筆 `usage_limit=1` 的 coupon；本案批次產生 `type='price'`、`plan`、`value=目標價` 的序號。

## 5. 純邏輯（`lib/plans.js`）

```js
applyCoupon(price, coupon)
  // type==='price' → Math.max(0, Math.min(coupon.value, price))   // 指定價，clamp 不超過當下價、不低於 0
  // type==='percent' → 既有
  // 否則(fixed) → 既有

couponError(coupon, { now = new Date(), plan } = {})
  // 既有檢查（status/starts_at/ends_at/usage_limit）不變
  // 新增：if (coupon.plan && plan && coupon.plan !== plan) return "coupon_wrong_plan"
```
> `couponError` 簽名由 `(coupon, now)` 改為 `(coupon, { now, plan })`；更新既有兩處呼叫（checkout、validate）傳入 `{ now, plan }`。保留純函式、可測。

新增錯誤碼文案：`coupon_wrong_plan`（前端 `COUPON_ERRORS` 加「此優惠碼不適用於此方案」）。

## 6. 後端

**checkout（`app/api/payuni/checkout/route.js`）**
- 先解析 coupon（既有流程）；以 `couponError(coupon, { plan })` 檢查含方案鎖。
- **pre_launch 放行**：把 Sub-1 的 `if (!isOnSale(...)) return not_on_sale` 改為
  `const hasPriceCoupon = coupon && coupon.type === 'price' && !couponError(coupon, { plan });`
  `if (!isOnSale(...) && !hasPriceCoupon) return not_on_sale;`
- 價格：`applyCoupon(currentPrice(...), coupon)` —— price 型即回 `Math.min(value, currentPrice)`。
- 限量券 CAS 預扣不變（序號 `usage_limit=1` 自動走此路）。

**validate（`app/api/coupons/validate/route.js`）**
- `couponError(coupon, { plan })` 含方案鎖。
- 回傳：`finalPrice = applyCoupon(currentPrice, coupon)`、`originalPrice = currentPrice`、`discount = 差額`、`type`（前端據此判斷是否指定價）。

## 7. 首頁 pre_launch 兌換（`HomeClient` + `BuyModal`）

- **HomeClient（pre_launch 狀態）**：在停用的購買鈕旁加「**持有序號／優惠碼？點此兌換**」連結 → `startBuy(bundle)` 開 BuyModal（鎖 bundle）。
- **BuyModal**：新增「未開賣模式」——當 `!sale.onSale`（pre_launch）時：套用有效指定價碼前**不顯示可購買價格**（顯示提示「輸入序號查看價格」）；「前往付款」**僅在已套用有效指定價碼**（`couponApplied?.type === 'price'`）時啟用，否則顯示提示「請輸入有效序號/優惠碼」。一般（wave/list）狀態行為不變（指定價碼也可在正常結帳時輸入）。
- BuyModal 需要知道 `sale.onSale`：由 `HomeClient` 將 `sale` 相關旗標傳入（目前 BuyModal 收 `plan/email/pricing`；新增 `onSale` prop）。

## 8. 後台

- **優惠券表單（`/admin` 優惠券頁）**：type 下拉新增「指定價」；選 price 時 `value` 標籤改「成交價 NT$」；新增「鎖定方案」選擇（不限／course／bundle）。
- **序號庫批次**：產生序號時可選 type='price'＋方案＋成交價（沿用 `lib/serial-codes.js` 產碼；每序號 `usage_limit=1`）。
- **API**（`/api/admin/coupons`、`/api/admin/coupon-batches`）：接受並驗證 `type='price'`、`plan`、`value`（price 時 value 為正整數）。

## 9. 通路設定值（後台建立，非寫死）

```
現場：序號批次 type=price, plan=bundle, value=2500, usage_limit=1/序號, ends_at=活動末（如 9/3）
粉絲：序號批次 type=price, plan=bundle, value=3499, usage_limit=1/序號, ends_at=9/3
```
（現場場次 6/27 在公開開賣 7/8 前 → 靠「全程可用」兌換。）

## 10. 測試（`lib/plans.test.js`）
- `applyCoupon` price 型：`value < price` → value；`value > price` → price（clamp）；`value` 0/負 → ≥0。
- `couponError` 方案鎖：`coupon.plan='bundle'` + `plan='course'` → `coupon_wrong_plan`；相符 → 通過；`coupon.plan=null` → 不限通過。
- 既有 percent/fixed 與 status/期限/usage_limit 測試不回歸。

## 11. 邊緣情況與決策
- **指定價 clamp**：`Math.min(value, currentPrice)`——避免指定價設得比當下波段價高反而超收。
- **pre_launch 放行僅限有效 price 券**：percent/fixed 券在 pre_launch 仍被 `not_on_sale` 擋（一般購買未開）。
- **方案鎖 NULL 相容**：現有 percent/fixed 券 `plan=NULL` → 不限方案，行為不變。
- **發票/金額**：用實收（`orders.amount`＝指定價），自動流。
- **序號冪等／CAS**：序號 `usage_limit=1`，沿用 checkout 既有限量券 CAS 預扣，防一碼多用。

## 12. 檔案異動（預期）
- `supabase-schema-coupons.sql` / `supabase-deploy.sql`（coupons 加 `plan`；'price' 註解）＋遷移 ALTER。
- `lib/plans.js`（`applyCoupon` price 型；`couponError` 方案鎖）＋ `lib/plans.test.js`。
- `app/api/payuni/checkout/route.js`（方案鎖＋pre_launch 放行）。
- `app/api/coupons/validate/route.js`（price 折後價＋方案鎖）。
- `app/HomeClient.jsx`（pre_launch 兌換入口）＋ `components/BuyModal.jsx`（未開賣模式需套 price 碼；新增 `onSale` prop；`COUPON_ERRORS` 加 `coupon_wrong_plan`）。
- 後台優惠券／序號庫表單與 `/api/admin/coupons`、`/api/admin/coupon-batches`（type=price＋plan＋value）。
- `CLAUDE.md`（指定價通路說明）。

## 13. 依賴與部署
- **依賴 Sub-1**：`currentPrice`/`isOnSale`/首頁三態。Sub-1 合併後再實作 Sub-2。
- 部署：跑 coupons `ALTER`（加 plan）→ 部署 → 後台建現場/粉絲序號批次 → 驗證（pre_launch 用序號可結帳、方案鎖、clamp）。
