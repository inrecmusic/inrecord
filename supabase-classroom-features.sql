-- 教室七大功能：資料表與 Storage（idempotent，可分段執行）
-- 依 CLAUDE.md 部署慣例，屬 supabase-deploy 之後的新增；沿用 service_role RLS 模式。

-- ───────────────────────────────────────────
-- ① 講義／樂譜 PDF 下載
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS materials (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id     UUID REFERENCES videos(id) ON DELETE CASCADE,  -- NULL = 全課程通用講義
  title        TEXT NOT NULL,
  storage_path TEXT NOT NULL,                                  -- course-materials bucket 內路徑
  file_size    INTEGER,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS materials_video_id_idx ON materials (video_id);

ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_materials" ON materials;
CREATE POLICY "service_role_materials" ON materials
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 私有 bucket：講義 PDF。下載一律經後端簽名 URL（service role 繞過 RLS，故不需額外 storage policy）。
INSERT INTO storage.buckets (id, name, public)
  VALUES ('course-materials', 'course-materials', false)
  ON CONFLICT (id) DO NOTHING;

-- ───────────────────────────────────────────
-- ⑦ 公告
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS announcements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  pinned     BOOLEAN NOT NULL DEFAULT FALSE,
  published  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS announcements_pub_idx ON announcements (published, pinned, created_at DESC);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_announcements" ON announcements;
CREATE POLICY "service_role_announcements" ON announcements
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 沿用既有 update_updated_at()（supabase-schema.sql 已定義）
DROP TRIGGER IF EXISTS announcements_updated_at ON announcements;
CREATE TRIGGER announcements_updated_at BEFORE UPDATE ON announcements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ───────────────────────────────────────────
-- ④ 筆記／書籤（私人，帶時間戳）
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id   UUID REFERENCES videos(id) ON DELETE CASCADE,
  seconds    INTEGER NOT NULL DEFAULT 0,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notes_user_video_idx ON notes (user_id, video_id, seconds);

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_notes" ON notes;
CREATE POLICY "service_role_notes" ON notes
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ───────────────────────────────────────────
-- ⑥ 測驗／評量（單選、伺服器計分、可重考）
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quizzes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  pass_score INTEGER NOT NULL DEFAULT 80,
  published  BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS quizzes_chapter_idx ON quizzes (chapter_id, published, sort_order);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id       UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question      TEXT NOT NULL,
  options       JSONB NOT NULL,
  correct_index INTEGER NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS quiz_questions_quiz_idx ON quiz_questions (quiz_id, sort_order);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_id    UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  score      INTEGER NOT NULL,
  passed     BOOLEAN NOT NULL,
  answers    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS quiz_attempts_user_quiz_idx ON quiz_attempts (user_id, quiz_id, created_at DESC);

ALTER TABLE quizzes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_quizzes" ON quizzes;
CREATE POLICY "service_role_quizzes" ON quizzes
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_quiz_questions" ON quiz_questions;
CREATE POLICY "service_role_quiz_questions" ON quiz_questions
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "service_role_quiz_attempts" ON quiz_attempts;
CREATE POLICY "service_role_quiz_attempts" ON quiz_attempts
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS quizzes_updated_at ON quizzes;
CREATE TRIGGER quizzes_updated_at BEFORE UPDATE ON quizzes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ───────────────────────────────────────────
-- ③ 完課證書
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS certificates (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email     TEXT,
  cert_code TEXT NOT NULL UNIQUE,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS certificates_user_uniq ON certificates (user_id);

ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_certificates" ON certificates;
CREATE POLICY "service_role_certificates" ON certificates
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
