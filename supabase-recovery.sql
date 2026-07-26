-- 未成交挽回信：原子去重旗標（每單最多寄一封）
alter table orders add column if not exists recovery_sent_at timestamptz;
