# 優惠序號庫設計（方案 A：批次化 coupon）

日期：2026-06-10
狀態：已核准設計，待實作計畫

## 背景與目標

後台目前的「優惠券」是一組共用碼（`coupons` 表），靠 `usage_limit` 控制總使用次數。

新需求：現場活動（如演奏會）限定優惠，需要產生**一批各自獨立、限用一次的序號**，逐一發給來賓，並能在後台**列出、複製、匯出 CSV**。

核心洞察：序號在結帳端的行為與優惠券完全相同（驗證、套折扣、防重複累計）。因此把每個序號實作成一筆 `usage_limit=1` 的 `coupons`，即可**完全重用現有結帳/冪等流程**，不碰金流風險區。

## 需求摘要（已與使用者確認）

- 每個批次可設定**不同折扣**（percent 或 fixed）。
- 每個序號**只能用一次**（一人結帳成功即失效）。
- 序號產生：**自動隨機產生（前綴＋數量）**，也允許**手動補建**特定碼。
- 產生後可在後台**畫面顯示＋一鍵複製**，並可**下載 CSV**。
- 與一般優惠券放在**同一頁面**（後台「優惠券」分頁）。

## 架構：方案 A — 序號 = 批次化的 coupon

- 新增 `coupon_batches` 表存批次 metadata（名稱、折扣、前綴、備註、起訖）。
- `coupons` 表加 `batch_id` 欄位；每個序號是一筆 `usage_limit=1`、`batch_id` 指向批次的 coupon。
- 結帳端零修改：序號即優惠券，沿用 `/api/coupons/validate` → checkout 後端再驗 → notify 以 `fulfilled_at` 冪等累計 `used`。用過一次 `used=1 >= usage_limit=1`，`couponError` 回 `coupon_used_up` 失效。

### 資料庫（追加至 `supabase-deploy.sql`，idempotent）

```sql
-- 批次資訊表
CREATE TABLE IF NOT EXISTS coupon_batches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,                   -- 例：2026 春季演奏會
  type        TEXT NOT NULL DEFAULT 'percent', -- 'percent' | 'fixed'
  value       INTEGER NOT NULL,                -- percent: 1-100；fixed: NT$
  prefix      TEXT,                            -- 序號前綴，例 LIVE
  note        TEXT,                            -- 活動備註
  starts_at   DATE,
  ends_at     DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE coupon_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_coupon_batches" ON coupon_batches;
CREATE POLICY "service_role_coupon_batches" ON coupon_batches
  USING (auth.role() = 'service_role');

-- coupons 加 batch_id（序號即 usage_limit=1 的 coupon）
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS batch_id UUID
  REFERENCES coupon_batches(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS coupons_batch_idx ON coupons (batch_id);
```

## 結帳端：零修改

- `/api/coupons/validate`：依 `code` 查 `coupons`，`couponError` 已檢查 `usage_limit/used` → 序號自動適用。
- checkout 後端再驗、寫入 `orders.coupon_code`：沿用。
- `/api/payuni/notify`：以 `order.fulfilled_at` 旗標冪等，付款成功才 `used += 1`（依 `code`）：沿用。

## 後端 API

### 既有調整
- `GET /api/admin/coupons`：查詢加 `.is("batch_id", null)`，一般優惠券列表**排除序號**，避免被批次序號灌爆。

### 新增 `app/api/admin/coupon-batches/route.js`
全部以 `verifyAdminToken` 保護，沿用既有 admin route 風格。

- `GET`：回傳批次清單，每批附 `total`（序號總數）、`used`（已使用數）統計（以 `batch_id` 聚合 `coupons`）。
- `POST`：建立批次。body：`{ name, type, value, prefix?, note?, starts_at?, ends_at?, mode, quantity?, codes? }`
  - 共用驗證：`name` 必填；`value > 0`；`type='percent'` 時 `value <= 100`。
  - `mode='auto'`：`quantity` 1–500；產生 `prefix + '-' + 隨機碼`，隨機碼字元集**排除易混字 0/O/1/I**；批次內與全表 `code` 唯一，碰撞自動重試（上限重試次數，仍衝突則回報 `code_collision`）。
  - `mode='manual'`：`codes` 字串陣列；去空白、轉大寫、去重；與現有 `coupons.code` 衝突則回 `code_exists` 並列出衝突碼。
  - 寫入：先 insert `coupon_batches` 取得 `batch_id`，再批次 insert `coupons`（每筆 `name`=批次名、`type/value`=批次設定、`usage_limit=1`、`status='active'`、`starts_at/ends_at`=批次設定、`batch_id`）。
- `DELETE ?id=`：刪批次，`ON DELETE CASCADE` 連帶刪該批序號。

### 新增 `app/api/admin/coupon-batches/[id]/codes/route.js`
- `GET`：回傳該批所有序號，含每碼 `code`、`used`（0/1）、衍生狀態（未使用 / 已使用）。供畫面顯示與 CSV 來源。

## 後台 UI（`app/admin/page.jsx` 的 `CouponsPage`）

同一分頁，現有優惠券區下方新增「序號庫」區：

- **批次卡片列表**：批次名、折扣（9 折 / 折 NT$X）、`已用 / 總數`、活動備註、起訖日。
- **「新增批次」彈窗**：
  - 名稱、折扣（type=percent/fixed＋value）、起訖日。
  - 模式切換：`自動產生`（前綴 + 數量）｜`手動貼上`（textarea，一行一碼）。
- **展開批次 → 序號清單**：
  - 每碼顯示「未使用 / 已使用」狀態。
  - **全選複製**（複製所有序號到剪貼簿）。
  - **下載 CSV**：欄位 `序號, 狀態, 折扣, 批次名稱`。
- **刪除批次**：彈窗確認；若該批已有使用過的序號，警示提醒（已成立訂單的 `orders.coupon_code` 為純文字快照，不受影響）。

## 邊界處理

- 自動產生數量上限 **500 / 次**。
- 自動碼碰撞自動重試；超過重試上限回 `code_collision`。
- 手動碼與既有 `coupons.code`（含一般券與其他批次）做唯一性檢查。
- 刪批次採 `ON DELETE CASCADE`；已使用序號刪除前彈窗警示。
- 已成立訂單的 `coupon_code` 是純文字快照，刪序號 / 刪批次不影響歷史訂單與發票。

## 不做（YAGNI）

- 不做整批共用總額度（已確認為一人一碼）。
- 不做每碼多次使用。
- 不改動現有金流 / notify / checkout 邏輯。
- 不做 email 自動寄送序號（現場手動發放）。

## 部署

- 於 Supabase SQL Editor 執行更新後的 `supabase-deploy.sql`（idempotent）。
- 程式部署沿用：push 後手動 `npx vercel --prod`（Vercel 未連動 GitHub）。
