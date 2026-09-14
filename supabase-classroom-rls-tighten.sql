-- supabase-classroom-rls-tighten.sql — 收掉 comments／ratings／submissions 對登入帳號的直連 policy（2026-09-14）
--
-- 背景：這三張表原本讓任何登入帳號（含自助免費註冊、沒買課的人）拿公開 anon key＋自己的 JWT
--   直接 SELECT／INSERT，繞過 API 就能列出所有留言者 email（PII）、灌評價進首頁星等、塞作業紀錄。
-- 前提：app/api/classroom/{rating,comment,submission,comments} 已全部改走 service role（與本檔同一批部署），
--   前端沒有任何直讀這三張表的地方（bootstrap／stats 本來就是 service role），policy 拿掉後功能不受影響。
-- 冪等，可重複執行。⚠️ 要先部署程式再跑本檔；順序反了，改版前的舊程式會在這段時間內留言／評價失敗。

-- 正式庫實際的 policy 名稱（2026-09-14 pg_policies 查得）：user_read_all_*（登入即可讀全部）、user_own_*（自己的列可增刪改）
DROP POLICY IF EXISTS "user_read_all_comments" ON comments;
DROP POLICY IF EXISTS "user_own_comments" ON comments;
DROP POLICY IF EXISTS "user_read_all_ratings" ON ratings;
DROP POLICY IF EXISTS "user_own_ratings" ON ratings;
DROP POLICY IF EXISTS "user_own_submissions" ON submissions;

-- repo schema 檔用的名稱（全新環境）
DROP POLICY IF EXISTS "auth_read_comments" ON comments;
DROP POLICY IF EXISTS "auth_insert_comments" ON comments;
DROP POLICY IF EXISTS "authenticated_insert_unit_comments" ON comments;

DROP POLICY IF EXISTS "public_read_visible_ratings" ON ratings;
DROP POLICY IF EXISTS "auth_insert_ratings" ON ratings;
DROP POLICY IF EXISTS "authenticated_insert_ratings" ON ratings;

DROP POLICY IF EXISTS "auth_read_own_submissions" ON submissions;
DROP POLICY IF EXISTS "auth_insert_submissions" ON submissions;

-- 確認：三張表應只剩 service_role_all_*（或 service_role_*）各一條
SELECT tablename, policyname, roles, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('comments', 'ratings', 'submissions')
ORDER BY tablename, policyname;
