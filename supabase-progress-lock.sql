-- supabase-progress-lock.sql — 收緊學習進度（progress）的直連寫入與 upsert_progress RPC（2026-09-15）
--
-- 背景：`upsert_progress` 是 SECURITY INVOKER 的 SQL 函式，但 Postgres 預設把新函式的 EXECUTE 給 PUBLIC，
--   加上 progress 表原本有 auth_own_progress（登入者可增刪改自己的列），任何登入帳號拿公開 anon key＋自己的 JWT
--   就能繞過 API（裝置上限／購課驗證／70% 完成判定）直接把任意單元灌成「已完成」——證書、儀表板進度、
--   營運週報的觀看數據全部失真。前端沒有直寫 progress 的地方，所有寫入都經 /api/classroom/progress（service role），
--   讀取也由 bootstrap／certificate 以 service role 帶回；只留「登入者可讀自己的進度」作保險。
-- 本檔不依賴程式版本，隨時可跑（「先部署程式再跑」那條規則對本檔不適用）。冪等，可重複執行。

-- 1) RPC：只留 service_role 可執行（service_role 是超級角色成員，REVOKE PUBLIC 不影響它）
--    參數型別列表要與 supabase-deploy.sql ⑧ 的定義完全一致，否則 REVOKE 會找不到函式而整檔失敗。
REVOKE EXECUTE ON FUNCTION public.upsert_progress(UUID, UUID, INTEGER, INTEGER, BOOLEAN, INTEGER)
  FROM PUBLIC, anon, authenticated;

-- 2) progress 表 policy：把所有名稱不以 service_role 開頭的 policy 全部拿掉（正式庫與 repo schema 的命名不一定相同，
--    用 pg_policies 動態找，不逐一猜名字），再補一條「登入者唯讀自己的列」。
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'progress' AND policyname NOT LIKE 'service\_role%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.progress', p.policyname);
  END LOOP;
END $$;

ALTER TABLE public.progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_read_own_progress ON public.progress
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 確認：progress 應只剩 service_role_progress（ALL）＋ auth_read_own_progress（SELECT）兩條
SELECT tablename, policyname, roles, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'progress'
ORDER BY policyname;
