-- ════════════════════════════════════════════════════════
-- InRecord 課程平台 Supabase Schema
-- 在 Supabase Dashboard → SQL Editor 執行此檔案
-- ════════════════════════════════════════════════════════

-- 課程試看名單
CREATE TABLE IF NOT EXISTS course_preview_leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL,
  course        TEXT NOT NULL DEFAULT '零基礎流行鋼琴入門課',
  source        TEXT NOT NULL DEFAULT 'course_preview_modal',
  tags          TEXT[] DEFAULT ARRAY['piano_demo_lead'],
  status        TEXT NOT NULL DEFAULT 'requested',
  -- 狀態值：requested | email_sent | demo_opened | purchased
  email_sent    BOOLEAN NOT NULL DEFAULT FALSE,
  demo_opened   BOOLEAN NOT NULL DEFAULT FALSE,
  purchased     BOOLEAN NOT NULL DEFAULT FALSE,
  email_sent_at    TIMESTAMPTZ,
  demo_opened_at   TIMESTAMPTZ,
  purchased_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Email 唯一索引
CREATE UNIQUE INDEX IF NOT EXISTS course_preview_leads_email_idx
  ON course_preview_leads (LOWER(email));

-- 自動更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER course_preview_leads_updated_at
  BEFORE UPDATE ON course_preview_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS（Row Level Security）
ALTER TABLE course_preview_leads ENABLE ROW LEVEL SECURITY;

-- 只允許 Service Role（後端 API）讀寫，前端無法直接存取
CREATE POLICY "service_role_only" ON course_preview_leads
  USING (auth.role() = 'service_role');

-- ────────────────────────────────────────
-- 訂單記錄（Payuni NotifyURL 寫入）
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT NOT NULL,
  plan                TEXT NOT NULL,
  plan_label          TEXT,
  amount              INTEGER NOT NULL, -- 新台幣，整數
  currency            TEXT NOT NULL DEFAULT 'twd',
  mer_trade_no        TEXT UNIQUE,      -- 特店訂單編號（我方產生，格式 INREC{timestamp}）
  payuni_trade_no     TEXT,             -- Payuni 交易編號（付款完成後由 Payuni 回傳）
  pay_type            TEXT,             -- 付款方式：CREDIT / VACC / CVS / BARCODE 等
  status              TEXT NOT NULL DEFAULT 'pending',
  -- 狀態值：pending | paid | refunded | failed
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only_orders" ON orders
  USING (auth.role() = 'service_role');
