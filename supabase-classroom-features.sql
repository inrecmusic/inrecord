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
