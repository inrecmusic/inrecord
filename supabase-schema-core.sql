-- 核心存取表：enrollments（課程開通）與 subscriptions（遊戲存取）。
-- 正式站這兩張表當初在 Supabase 後台手動建立、repo 裡原本沒有 SQL；全新環境（preview 專案）
-- 依 CLAUDE.md 順序跑到 supabase-deploy.sql 會在建 enrollments 索引時失敗。
-- 全檔 idempotent（IF NOT EXISTS），正式站重跑不會改到既有資料。
-- 執行順序：supabase-schema.sql 之後、supabase-deploy.sql 之前。

-- 課程開通：一個 email 對一門課只有一列（grantAccess 用 upsert onConflict(email,course_id)）
CREATE TABLE IF NOT EXISTS enrollments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT NOT NULL,
  course_id      TEXT NOT NULL DEFAULT 'piano-101',
  order_id       UUID,                               -- 最近一次開通它的訂單（payuni/manual），可為 NULL
  enrolled_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  early_override TEXT,                               -- 'early' | 'standard' | NULL＝依購買時間自動判斷
  UNIQUE (email, course_id)
);
CREATE INDEX IF NOT EXISTS enrollments_email_idx ON enrollments (email);
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_enrollments" ON enrollments;
CREATE POLICY "service_role_enrollments" ON enrollments USING (auth.role() = 'service_role');

-- 遊戲存取（買斷制：expires_at 用遠期 2999-12-31 表示永久）。定義同 CLAUDE.md「subscriptions 資料表」。
CREATE TABLE IF NOT EXISTS subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL,
  plan_type       TEXT NOT NULL,                     -- 'bundle' | 'game'（舊資料可能有 monthly/yearly/gift）
  status          TEXT NOT NULL DEFAULT 'active',
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  payuni_order_id TEXT,
  source          TEXT NOT NULL DEFAULT 'direct',    -- 'purchase' | 'manual'
  auto_renew      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS subscriptions_email_status_idx ON subscriptions (email, status, expires_at);
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_subscriptions" ON subscriptions;
CREATE POLICY "service_role_subscriptions" ON subscriptions USING (auth.role() = 'service_role');
