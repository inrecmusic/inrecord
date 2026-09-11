-- ════════════════════════════════════════════════════════
-- InRecord 音樂教室 Classroom Schema
--
-- ⚠️⚠️⚠️ 危險：本檔含 DROP TABLE ... CASCADE（unit_comments／ratings／submissions）。
--        對「有資料的資料庫」重跑會刪光學員留言、課程評價、作業繳交，且救不回來。
--        本檔只給全新環境建置用，**不是 idempotent、不可對正式庫重跑**。
--        只想補後來新增的欄位／索引，請改跑 supabase-deploy.sql 那類冪等檔。
--
-- 執行順序：一定要在 supabase-schema-music.sql 之後。
--   ① music 先建 chapters／videos，本檔的 comments／submissions／progress 都參照它們；
--   ② music 那份 ratings（欄位叫 rating、沒有 user_id）與 submissions（沒有 user_id）是舊版，
--      由本檔 DROP 掉重建成程式實際在用的版本（ratings.score／user_id）。
--      順序顛倒＝留下舊版 ratings，評價功能整組壞。
--
-- 在 Supabase Dashboard → SQL Editor 執行此檔案
-- ════════════════════════════════════════════════════════

-- ────────────────────────────────────────
-- 單元評論（admin + 學員共用同一張表）
-- 取代先前 unit_comments，管理員 API 路由也改為讀此表
-- ────────────────────────────────────────
DROP TABLE IF EXISTS unit_comments CASCADE;

CREATE TABLE IF NOT EXISTS comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  video_id    UUID REFERENCES videos(id) ON DELETE CASCADE,
  chapter_id  UUID REFERENCES chapters(id) ON DELETE SET NULL,
  user_name   TEXT,
  user_email  TEXT,
  content     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  -- 狀態值：pending | replied
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS comments_video_id_idx    ON comments (video_id);
CREATE INDEX IF NOT EXISTS comments_chapter_id_idx  ON comments (chapter_id);
CREATE INDEX IF NOT EXISTS comments_status_idx      ON comments (status);
CREATE INDEX IF NOT EXISTS comments_user_id_idx     ON comments (user_id);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- 管理員（service role）完整讀寫
CREATE POLICY "service_role_comments" ON comments
  USING (auth.role() = 'service_role');

-- 登入學員可讀取所有留言
CREATE POLICY "auth_read_comments" ON comments
  FOR SELECT TO authenticated USING (TRUE);

-- 登入學員可新增自己的留言
CREATE POLICY "auth_insert_comments" ON comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ────────────────────────────────────────
-- 留言回覆（管理員回覆，admin 後台寫入）
-- 同先前 comment_replies，無需更動
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comment_replies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id    UUID REFERENCES comments(id) ON DELETE CASCADE,
  admin_content TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- music 檔已建過同名表（外鍵指向舊的 unit_comments），上面 DROP unit_comments CASCADE 會把那條外鍵拿掉，
-- 而 CREATE TABLE IF NOT EXISTS 不會重建 → 表會變成沒有外鍵。lib/comments.js 的巢狀查詢
-- comments→comment_replies 是 PostgREST 靠外鍵推導的，缺外鍵會直接查不到關聯，所以這裡補回來（冪等）。
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.comment_replies'::regclass AND contype = 'f') THEN
    ALTER TABLE comment_replies ADD CONSTRAINT comment_replies_comment_id_fkey
      FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE comment_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_comment_replies" ON comment_replies;
CREATE POLICY "service_role_comment_replies" ON comment_replies
  USING (auth.role() = 'service_role');

-- 所有人可讀回覆（前台顯示）。DROP 是因為 music 檔已建過同名 policy，重名會 ERROR 讓整份 rollback。
DROP POLICY IF EXISTS "public_read_comment_replies" ON comment_replies;
CREATE POLICY "public_read_comment_replies" ON comment_replies
  FOR SELECT USING (TRUE);

-- ────────────────────────────────────────
-- 課程評價（欄位 score 而非 rating）
-- ────────────────────────────────────────
DROP TABLE IF EXISTS ratings CASCADE;

CREATE TABLE IF NOT EXISTS ratings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  course_id   TEXT NOT NULL DEFAULT 'main',
  score       SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
  user_name   TEXT,
  user_email  TEXT,
  content     TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  -- 狀態值：pending | replied
  hidden      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ratings_user_id_idx ON ratings (user_id);
CREATE INDEX IF NOT EXISTS ratings_status_idx  ON ratings (status);

ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_ratings" ON ratings
  USING (auth.role() = 'service_role');

-- 所有人可讀未隱藏評價
CREATE POLICY "public_read_visible_ratings" ON ratings
  FOR SELECT USING (hidden = FALSE);

-- 登入學員可新增自己的評價（每人一筆，由應用層控制）
CREATE POLICY "auth_insert_ratings" ON ratings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ────────────────────────────────────────
-- 評價回覆
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rating_replies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rating_id     UUID REFERENCES ratings(id) ON DELETE CASCADE,
  admin_content TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 同 comment_replies：上面 DROP ratings CASCADE 會拿掉 music 檔那張表的外鍵，表本身留著不會重建。
-- 後台 ratings→rating_replies 的巢狀查詢要靠外鍵，這裡補回來（冪等）。
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.rating_replies'::regclass AND contype = 'f') THEN
    ALTER TABLE rating_replies ADD CONSTRAINT rating_replies_rating_id_fkey
      FOREIGN KEY (rating_id) REFERENCES ratings(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE rating_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_rating_replies" ON rating_replies;
CREATE POLICY "service_role_rating_replies" ON rating_replies
  USING (auth.role() = 'service_role');

-- DROP 是因為 music 檔已建過同名 policy（重名會 ERROR）
DROP POLICY IF EXISTS "public_read_rating_replies" ON rating_replies;
CREATE POLICY "public_read_rating_replies" ON rating_replies
  FOR SELECT USING (TRUE);

-- ────────────────────────────────────────
-- 作業繳交（submissions）
-- ────────────────────────────────────────
DROP TABLE IF EXISTS submissions CASCADE;

CREATE TABLE IF NOT EXISTS submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  video_id      UUID REFERENCES videos(id) ON DELETE CASCADE,
  user_email    TEXT,
  file_url      TEXT,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  feedback      TEXT,
  reviewed      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS submissions_video_id_idx  ON submissions (video_id);
CREATE INDEX IF NOT EXISTS submissions_user_id_idx   ON submissions (user_id);

ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_submissions" ON submissions
  USING (auth.role() = 'service_role');

-- 學員只能讀取自己的繳交
CREATE POLICY "auth_read_own_submissions" ON submissions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 學員可新增自己的繳交
CREATE POLICY "auth_insert_submissions" ON submissions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ────────────────────────────────────────
-- 學習進度
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS progress (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id        UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  watched_seconds INTEGER NOT NULL DEFAULT 0,
  total_seconds   INTEGER NOT NULL DEFAULT 0,
  watched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed       BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (user_id, video_id)
);

CREATE INDEX IF NOT EXISTS progress_user_id_idx ON progress (user_id);

ALTER TABLE progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_progress" ON progress
  USING (auth.role() = 'service_role');

-- 學員只能讀寫自己的進度
CREATE POLICY "auth_own_progress" ON progress
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ────────────────────────────────────────
-- Storage bucket：作業上傳
-- （在 Supabase Dashboard → Storage 手動建立或執行以下）
-- ────────────────────────────────────────
-- INSERT INTO storage.buckets (id, name, public) VALUES ('homework', 'homework', false)
-- ON CONFLICT DO NOTHING;

-- 登入學員可上傳到 homework bucket
-- CREATE POLICY "auth_upload_homework" ON storage.objects
--   FOR INSERT TO authenticated WITH CHECK (bucket_id = 'homework' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 學員只能讀自己的檔案
-- CREATE POLICY "auth_read_own_homework" ON storage.objects
--   FOR SELECT TO authenticated USING (bucket_id = 'homework' AND (storage.foldername(name))[1] = auth.uid()::text);
