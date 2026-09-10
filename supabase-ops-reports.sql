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
-- cron 週報同一期間只能有一份：程式端「先 select 再 insert」不是原子的，兩次觸發重疊會產出兩份、
-- 並多付一次模型費用。改由這個唯一索引把關（lib/ops-report/run.js 先插佔位列，撞鍵 23505 就讓路）。
-- ⚠️ 若既有資料已有同期間的重複 cron 列，要先刪到只剩一列這個索引才建得起來。
CREATE UNIQUE INDEX IF NOT EXISTS ops_reports_cron_period_uniq
  ON ops_reports (period_end) WHERE triggered_by = 'cron';
ALTER TABLE ops_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_ops_reports" ON ops_reports;
CREATE POLICY "service_role_ops_reports" ON ops_reports
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
