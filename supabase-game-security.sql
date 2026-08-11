-- 互動遊戲存取安全：裝置上限（game_devices）＋設定（game_settings）
CREATE TABLE IF NOT EXISTS game_devices (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id    TEXT NOT NULL,
  user_agent   TEXT,
  ip           TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, device_id)
);
CREATE INDEX IF NOT EXISTS game_devices_user_lastseen_idx
  ON game_devices (user_id, last_seen_at DESC);
ALTER TABLE game_devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_game_devices" ON game_devices;
CREATE POLICY "service_role_game_devices" ON game_devices
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS game_settings (
  id           TEXT PRIMARY KEY DEFAULT 'default',
  device_limit INT NOT NULL DEFAULT 3,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO game_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;
ALTER TABLE game_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_game_settings" ON game_settings;
CREATE POLICY "service_role_game_settings" ON game_settings
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
