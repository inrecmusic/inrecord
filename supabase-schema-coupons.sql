-- ════════════════════════════════════════
-- 優惠券 coupons 資料表 + orders.coupon_code
-- 於 Supabase SQL Editor 執行一次即可
-- ════════════════════════════════════════

CREATE TABLE IF NOT EXISTS coupons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  code        TEXT NOT NULL UNIQUE,        -- 優惠碼（大寫）
  type        TEXT NOT NULL DEFAULT 'percent', -- 'percent' | 'fixed' | 'price'
  value       INTEGER NOT NULL,            -- percent: 1-100；fixed: NT$；price: 指定成交價 NT$
  used        INTEGER NOT NULL DEFAULT 0,  -- 已使用次數（付款成功才累計）
  usage_limit INTEGER,                     -- NULL = 無限制
  status      TEXT NOT NULL DEFAULT 'active', -- 'active' | 'disabled'
  plan        TEXT,                        -- 鎖定方案 'course'|'bundle'；NULL = 不限
  starts_at   DATE,                        -- NULL = 不限開始
  ends_at     DATE,                        -- NULL = 不限結束
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS coupons_code_idx ON coupons (code);
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_coupons" ON coupons;
CREATE POLICY "service_role_coupons" ON coupons
  USING (auth.role() = 'service_role');

-- 訂單記錄套用的優惠碼
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;
