-- 結帳二次確認（2026-09）：訂單記錄同意當下的服務條款版本與時間。idempotent，可重複執行。
-- ⚠️ 必須先於程式碼部署：checkout 每筆都寫這兩欄，漏跑會讓所有結帳失敗。
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS terms_version TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS terms_agreed_at TIMESTAMPTZ;
COMMENT ON COLUMN public.orders.terms_version IS '同意的服務條款版本（條款「最後更新」日期 YYYY-MM-DD）';
COMMENT ON COLUMN public.orders.terms_agreed_at IS '按下「確認購買」的時間';
