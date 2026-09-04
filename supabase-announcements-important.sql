-- 教室公告：「重要」旗標（學員進教室先彈出，需按「知道了」）。
-- idempotent，可重複執行；既有公告預設 false、行為不變。
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS important BOOLEAN NOT NULL DEFAULT FALSE;
