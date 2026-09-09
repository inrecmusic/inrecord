-- ────────────────────────────────────────────────────────────────────────
-- 後台營運助理週報（2026-09-09）：每週 cron 產生一份，存模型輸出與資料包；唯讀報告。冪等可重跑。
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ops_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start  TIMESTAMPTZ NOT NULL,
  period_end    TIMESTAMPTZ NOT NULL,
  triggered_by  TEXT NOT NULL DEFAULT 'cron',            -- 'cron' | 'manual'
  report        JSONB NOT NULL,                           -- 模型輸出（已清洗）
  pack          JSONB NOT NULL,                           -- 程式算出的資料包（可回溯核對）
  model         TEXT,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  cost_usd      NUMERIC(8,4),
  emailed_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ops_reports_period_idx ON ops_reports (period_end DESC, triggered_by);
ALTER TABLE ops_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_ops_reports" ON ops_reports;
CREATE POLICY "service_role_ops_reports" ON ops_reports
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
