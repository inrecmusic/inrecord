-- ────────────────────────────────────────────────────────────────────────
-- 電子報退訂名單（2026-09-02）：信中「取消訂閱」按鈕／信箱一鍵退訂寫入；群發撈名單時排除。
-- 只擋電子報群發，登入驗證碼／購課／開通信不受影響。冪等可重跑。
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS newsletter_unsubscribes (
  email      TEXT PRIMARY KEY,
  source     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE newsletter_unsubscribes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_newsletter_unsubscribes" ON newsletter_unsubscribes;
CREATE POLICY "service_role_newsletter_unsubscribes" ON newsletter_unsubscribes
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
