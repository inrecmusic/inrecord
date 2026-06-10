-- ════════════════════════════════════════
-- 課程 courses 資料表（後台課程管理）
-- 於 Supabase SQL Editor 執行一次即可
-- ════════════════════════════════════════

CREATE TABLE IF NOT EXISTS courses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT,
  price       INTEGER NOT NULL DEFAULT 0,   -- 新台幣，整數
  status      TEXT NOT NULL DEFAULT 'published', -- 'published' | 'draft'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_courses" ON courses;
CREATE POLICY "service_role_courses" ON courses
  USING (auth.role() = 'service_role');

-- 預設帶入現有的單一課程（如已存在同名課程則略過）
INSERT INTO courses (title, description, price, status)
SELECT '零基礎流行鋼琴入門課', '從零開始學習流行鋼琴，包含基礎樂理、和弦節奏與歌曲實作', 3800, 'published'
WHERE NOT EXISTS (SELECT 1 FROM courses);
