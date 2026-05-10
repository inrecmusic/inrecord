-- ════════════════════════════════════════════════════════
-- InRecord 音樂教室擴充 Schema
-- 在 Supabase Dashboard → SQL Editor 執行此檔案
-- ════════════════════════════════════════════════════════

-- ────────────────────────────────────────
-- 章節
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chapters (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only_chapters" ON chapters
  USING (auth.role() = 'service_role');

-- ────────────────────────────────────────
-- 單元（影片）
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS videos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id          UUID REFERENCES chapters(id) ON DELETE SET NULL,
  title               TEXT NOT NULL,
  vimeo_id            TEXT,
  duration            TEXT,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  published           BOOLEAN NOT NULL DEFAULT FALSE,
  assignment_desc     TEXT,
  assignment_deadline DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS videos_chapter_id_idx ON videos (chapter_id);
CREATE INDEX IF NOT EXISTS videos_sort_order_idx ON videos (chapter_id, sort_order);

ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only_videos" ON videos
  USING (auth.role() = 'service_role');

-- 前台學員可讀取已發布單元（anon 可讀）
CREATE POLICY "public_read_published_videos" ON videos
  FOR SELECT USING (published = TRUE);

-- ────────────────────────────────────────
-- 作業繳交
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS submissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id     UUID REFERENCES videos(id) ON DELETE CASCADE,
  user_email   TEXT NOT NULL,
  file_url     TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  feedback     TEXT,
  reviewed     BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS submissions_video_id_idx ON submissions (video_id);

ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only_submissions" ON submissions
  USING (auth.role() = 'service_role');

-- ────────────────────────────────────────
-- 單元評論（學員留言）
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS unit_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id    UUID REFERENCES videos(id) ON DELETE CASCADE,
  user_email  TEXT NOT NULL,
  user_name   TEXT,
  content     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  -- 狀態值：pending | replied
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS unit_comments_video_id_idx ON unit_comments (video_id);
CREATE INDEX IF NOT EXISTS unit_comments_status_idx   ON unit_comments (status);

ALTER TABLE unit_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only_unit_comments" ON unit_comments
  USING (auth.role() = 'service_role');

-- 前台學員可新增留言
CREATE POLICY "authenticated_insert_unit_comments" ON unit_comments
  FOR INSERT WITH CHECK (TRUE);

-- ────────────────────────────────────────
-- 單元評論回覆（管理員回覆）
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comment_replies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id    UUID REFERENCES unit_comments(id) ON DELETE CASCADE,
  admin_content TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE comment_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only_comment_replies" ON comment_replies
  USING (auth.role() = 'service_role');

-- 前台可讀取回覆（anon 可讀）
CREATE POLICY "public_read_comment_replies" ON comment_replies
  FOR SELECT USING (TRUE);

-- ────────────────────────────────────────
-- 課程評價
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ratings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email  TEXT NOT NULL,
  user_name   TEXT,
  rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  content     TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  -- 狀態值：pending | replied
  hidden      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ratings_status_idx ON ratings (status);

ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only_ratings" ON ratings
  USING (auth.role() = 'service_role');

-- 前台可讀取未隱藏評價
CREATE POLICY "public_read_visible_ratings" ON ratings
  FOR SELECT USING (hidden = FALSE);

-- 前台學員可新增評價
CREATE POLICY "authenticated_insert_ratings" ON ratings
  FOR INSERT WITH CHECK (TRUE);

-- ────────────────────────────────────────
-- 課程評價回覆（管理員回覆）
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rating_replies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rating_id     UUID REFERENCES ratings(id) ON DELETE CASCADE,
  admin_content TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE rating_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only_rating_replies" ON rating_replies
  USING (auth.role() = 'service_role');

-- 前台可讀取回覆
CREATE POLICY "public_read_rating_replies" ON rating_replies
  FOR SELECT USING (TRUE);
