-- ════════════════════════════════════════════════════════════════════════
-- InRecord — 部署需執行的 SQL（彙整清單）
-- ════════════════════════════════════════════════════════════════════════
--
-- 使用方式：
--   1. 打開 Supabase → SQL Editor → New query
--   2. 整份貼上、按 Run（全部為 IF NOT EXISTS / idempotent，可安全重複執行）
--
-- 內含四組變更：
--   ①  發票（Amego）         — orders 表新增發票相關欄位
--   ②  優惠券                — coupons 表 + orders.coupon_code
--   ③  課程管理              — courses 表（含預設課程種子）
--   ④  銷售期間設定          — sale_settings 表（單列；開課日/早鳥/各方案價/手動覆寫）
--
-- 前置：本檔假設 orders 表已存在（見 supabase-schema.sql）。
-- 對應的單獨檔案：
--   ① supabase-schema-invoice.sql
--   ② supabase-schema-coupons.sql
--   ③ supabase-schema-courses.sql
-- ════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────
-- ① 發票（Amego 電子發票）：orders 欄位
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS invoice_no    TEXT,
  ADD COLUMN IF NOT EXISTS buyer_name    TEXT,
  ADD COLUMN IF NOT EXISTS buyer_tax_id  TEXT,
  ADD COLUMN IF NOT EXISTS carrier_type  TEXT,
  ADD COLUMN IF NOT EXISTS carrier_id    TEXT,
  ADD COLUMN IF NOT EXISTS invoice_error TEXT,        -- 最後一次開票失敗原因（成功時清為 null）
  ADD COLUMN IF NOT EXISTS email_error   TEXT,        -- 最後一次寄開課信失敗原因（成功時清為 null）
  ADD COLUMN IF NOT EXISTS fulfilled_at  TIMESTAMPTZ; -- 首次付款成功處理時間；作為優惠券累計／寄信的去重旗標（與可重試的開發票分離）


-- ────────────────────────────────────────────────────────────────────────
-- ② 優惠券：coupons 表 + orders.coupon_code
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coupons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  code        TEXT NOT NULL UNIQUE,            -- 優惠碼（大寫）
  type        TEXT NOT NULL DEFAULT 'percent', -- 'percent' | 'fixed'
  value       INTEGER NOT NULL,                -- percent: 1-100；fixed: NT$
  used        INTEGER NOT NULL DEFAULT 0,      -- 已使用次數（付款成功才累計）
  usage_limit INTEGER,                         -- NULL = 無限制
  status      TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'disabled'
  starts_at   DATE,                            -- NULL = 不限開始
  ends_at     DATE,                            -- NULL = 不限結束
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS coupons_code_idx ON coupons (code);
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_coupons" ON coupons;
CREATE POLICY "service_role_coupons" ON coupons
  USING (auth.role() = 'service_role');

ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;


-- ────────────────────────────────────────────────────────────────────────
-- ③ 課程管理：courses 表（含預設課程種子）
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT,
  price       INTEGER NOT NULL DEFAULT 0,        -- 新台幣，整數
  status      TEXT NOT NULL DEFAULT 'published', -- 'published' | 'draft'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_courses" ON courses;
CREATE POLICY "service_role_courses" ON courses
  USING (auth.role() = 'service_role');

-- 預設帶入現有的單一課程（若 courses 已有任何資料則略過）
INSERT INTO courses (title, description, price, status)
SELECT '零基礎流行鋼琴入門課', '從零開始學習流行鋼琴，包含基礎樂理、和弦節奏與歌曲實作', 3800, 'published'
WHERE NOT EXISTS (SELECT 1 FROM courses);

-- ════════════════════════════════════════
-- 優惠序號庫：coupon_batches 表 + coupons.batch_id
-- 序號 = usage_limit=1 的 coupon；結帳流程與優惠券共用
-- ════════════════════════════════════════
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

ALTER TABLE coupons ADD COLUMN IF NOT EXISTS batch_id UUID
  REFERENCES coupon_batches(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS coupons_batch_idx ON coupons (batch_id);

-- ════════════════════════════════════════
-- 銷售期間設定 sale_settings（單列）
-- 開課日/早鳥截止日/各方案價格/手動覆寫/開課通知冪等旗標
-- ════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sale_settings (
  id                 TEXT PRIMARY KEY DEFAULT 'default',
  open_at            TIMESTAMPTZ,
  early_bird_ends_at TIMESTAMPTZ,
  plan_pricing       JSONB NOT NULL DEFAULT '{}'::jsonb,
  lock_override      TEXT,
  launch_notified_at TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sale_settings_singleton CHECK (id = 'default'),
  CONSTRAINT sale_settings_lock_override_chk
    CHECK (lock_override IS NULL OR lock_override IN ('open','locked'))
);

INSERT INTO sale_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

ALTER TABLE sale_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_write_sale_settings" ON sale_settings;
CREATE POLICY "service_role_write_sale_settings" ON sale_settings
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- SELECT 刻意對 public 開放（開課日/價格本就公開顯示；供 middleware 用 anon 讀）。
DROP POLICY IF EXISTS "public_read_sale_settings" ON sale_settings;
CREATE POLICY "public_read_sale_settings" ON sale_settings
  FOR SELECT USING (true);
