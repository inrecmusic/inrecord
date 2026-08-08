-- 學員資料頁：student_profiles（一人一列、service_role RLS、含 PII 切勿開公開讀）
CREATE TABLE IF NOT EXISTS student_profiles (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  real_name  TEXT,
  phone      TEXT,
  level      TEXT,   -- none|little|some
  goal       TEXT,
  source     TEXT,   -- ig|friend|concert|search|other
  equipment  TEXT,   -- acoustic|digital|none
  age_group  TEXT,   -- under18|18_29|30_44|45_59|60plus
  gender     TEXT,   -- male|female|other|prefer_not
  consent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS student_profiles_email_idx ON student_profiles (email);

ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_student_profiles" ON student_profiles;
CREATE POLICY "service_role_student_profiles" ON student_profiles
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS student_profiles_updated_at ON student_profiles;
CREATE TRIGGER student_profiles_updated_at BEFORE UPDATE ON student_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
