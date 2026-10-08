-- 首頁課程評價跑馬燈：「首頁精選」旗標（後台勾選才會出現在首頁）。
-- idempotent，可重複執行；既有評價預設 false，首頁行為不變。
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE;
