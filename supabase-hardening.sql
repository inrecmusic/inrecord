-- ════════════════════════════════════════════════════════════
-- InRecord 上線前資料庫強化（2026-06）
-- 在 Supabase SQL Editor 依序執行。可重複執行（idempotent）。
-- ════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1) subscriptions 冪等唯一索引
--    搭配 notify 改用 upsert(onConflict: payuni_order_id, ignoreDuplicates)
--    確保同一筆購買訂單只會有一列「purchase」存取記錄。
-- ─────────────────────────────────────────────

-- 1a. 先檢查是否已有重複（理論上 sandbox 測試可能留下）。有結果代表要先清。
SELECT payuni_order_id, count(*) AS dup
FROM subscriptions
WHERE source = 'purchase' AND payuni_order_id IS NOT NULL
GROUP BY payuni_order_id
HAVING count(*) > 1;

-- 1b. 若上面有結果，先執行這段去重（保留最早一筆，刪其餘）。沒重複可略過。
DELETE FROM subscriptions a
USING subscriptions b
WHERE a.source = 'purchase' AND b.source = 'purchase'
  AND a.payuni_order_id = b.payuni_order_id
  AND a.payuni_order_id IS NOT NULL
  AND a.ctid > b.ctid;

-- 1c. 建立 partial unique index（去重後才建得起來）。
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sub_purchase_order
  ON subscriptions (payuni_order_id)
  WHERE source = 'purchase' AND payuni_order_id IS NOT NULL;


-- ─────────────────────────────────────────────
-- 2) RLS 稽核：找出 public schema 中「沒開 RLS」的表
--    anon key 是公開的，沒開 RLS 的表會被任何人經 PostgREST 直接讀取。
-- ─────────────────────────────────────────────

-- 2a. 先看哪些表 rowsecurity = false（這些就是要補的）
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY rowsecurity ASC, tablename;

-- 2b. 對每個「該鎖」的敏感表，套用下面範本（把 <TABLE> 換成表名）。
--     service_role 會繞過 RLS，所以開了 RLS + 只給 service_role policy
--     ＝ 前端 anon 一律讀不到，但你的後端 API（service role）照常運作。
--
--     ALTER TABLE <TABLE> ENABLE ROW LEVEL SECURITY;
--     DROP POLICY IF EXISTS "service_role_<TABLE>" ON <TABLE>;
--     CREATE POLICY "service_role_<TABLE>" ON <TABLE>
--       USING (auth.role() = 'service_role')
--       WITH CHECK (auth.role() = 'service_role');
--
--  建議至少確認以下含 PII / 交易資料的表都已開 RLS：
--    orders, enrollments, subscriptions, leads,
--    ratings, submissions, progress, unit_comments
--
--  範例（orders）：
-- ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "service_role_orders" ON orders;
-- CREATE POLICY "service_role_orders" ON orders
--   USING (auth.role() = 'service_role')
--   WITH CHECK (auth.role() = 'service_role');
