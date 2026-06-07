-- ════════════════════════════════════════
-- 光貿 Amego 電子發票：orders 資料表欄位
-- 於 Supabase SQL Editor 執行一次即可
-- ════════════════════════════════════════

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS invoice_no   TEXT,
ADD COLUMN IF NOT EXISTS buyer_name   TEXT,
ADD COLUMN IF NOT EXISTS buyer_tax_id TEXT,
ADD COLUMN IF NOT EXISTS carrier_type TEXT,
ADD COLUMN IF NOT EXISTS carrier_id   TEXT;
