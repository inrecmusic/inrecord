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
-- 2) RLS 稽核：擋掉未登入 anon 讀取
--    存取模型：app 讀資料只走 (a) service_role（繞過 RLS）或
--    (b) getUserClient = anon key + 使用者 JWT（authenticated 身分）。
--    前端 0 處用 anon client 直接 supabase.from() 讀表。
--    => 未登入 anon 不該、也不需要讀任何表。
-- ─────────────────────────────────────────────

-- 2a. 查每張表的 RLS 開關（rowsecurity = false 代表完全沒鎖）。
--     2026-06-17 實測：public schema 17 張表全部 = true（這關已過）。
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY rowsecurity ASC, tablename;

-- 2b. 但「RLS 開啟」≠「anon 讀不到」：要看 policy 允許哪個 role。
--     roles = {public} 含 anon；只要 qual 寬鬆（true / 非 auth 條件）anon 就讀得到。
SELECT tablename, policyname, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 2c. 2026-06-17 實際修補（依 2b 結果，把 anon 破口收乾淨）。
--     安全性：service_role 繞過 RLS 不受影響；登入者走 authenticated 仍命中；
--     只擋掉未登入 anon。純 DB 變更、不需重新部署。

--   (i) 付費 / 受保護內容：完全移除公開讀。
--       games 的公開讀會讓 anon 直接撈 html_content（繞過付費＋浮水印）；
--       videos 會洩漏 bunny_video_id。兩者 app 都只經 service role 提供。
DROP POLICY IF EXISTS "public_read_active_games"     ON games;
DROP POLICY IF EXISTS "public_read_published_videos" ON videos;

--   (ii) 登入後才需要的內容：把讀取 policy 由 public 收窄成 authenticated。
--        ⚠️ 修正（2026-06-19）：舊版這裡寫死了不存在的 policy 名稱，且 ALTER POLICY
--        沒有 IF EXISTS——整批貼進 SQL Editor 執行時會在第一條就 "policy does not exist"
--        報錯並 ROLLBACK，連同上面兩條 DROP 一起失效，等於完全沒修到 games/videos。
--        改用「實際存在的名稱 + DO/IF EXISTS」包起來：冪等、可重複執行，
--        某條 policy 不存在時只是略過、不會中斷整批。
--        ⚠️ 命名漂移（2026-06-19 以正式庫 pg_policies 實測）：正式庫的 policy 名稱與
--        repo schema 檔不一致——正式庫是 user_read_all_comments / read_all_replies /
--        user_read_all_ratings / read_all_rating_replies / public_read_chapters /
--        public_read_assignments（且正式庫確實有 chapters、assignments 表）；schema 檔則是
--        auth_read_comments / public_read_* 那組。為同時涵蓋兩邊，下面兩組名稱都列、各自用
--        IF EXISTS 略過不存在者（冪等）。實測正式庫這幾張表的讀取 policy 已是 authenticated，
--        故此段對正式庫為 no-op；games/videos 也已無公開讀。
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      -- repo schema 檔命名（fresh deploy 會建這些）
      ('comments',        'auth_read_comments'),
      ('comment_replies', 'public_read_comment_replies'),
      ('ratings',         'public_read_visible_ratings'),
      ('rating_replies',  'public_read_rating_replies'),
      -- 正式庫實際命名（與 schema 檔分歧）
      ('comments',        'user_read_all_comments'),
      ('comment_replies', 'read_all_replies'),
      ('ratings',         'user_read_all_ratings'),
      ('rating_replies',  'read_all_rating_replies'),
      ('chapters',        'public_read_chapters'),
      ('assignments',     'public_read_assignments')
    ) AS t(tbl, pol)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = r.tbl AND policyname = r.pol
    ) THEN
      EXECUTE format('ALTER POLICY %I ON %I TO authenticated', r.pol, r.tbl);
    END IF;
  END LOOP;
END $$;

-- 2d. 修補後應達成的狀態（重跑 2b 驗證）：
--     - games / videos 只剩 service_role_* policy。
--     - 上面 6 條讀取 policy 的 roles 變成 {authenticated}。
--     - 其餘 {public} policy 都被 auth.role()='service_role' 或 auth.uid()=user_id 把關。
--     => public schema 無任何「anon 可讀」的寬鬆 policy。

-- 2e. 新增敏感表時的鎖定範本（把 <TABLE> 換成表名）：
--     ALTER TABLE <TABLE> ENABLE ROW LEVEL SECURITY;
--     DROP POLICY IF EXISTS "service_role_<TABLE>" ON <TABLE>;
--     CREATE POLICY "service_role_<TABLE>" ON <TABLE>
--       USING (auth.role() = 'service_role')
--       WITH CHECK (auth.role() = 'service_role');
