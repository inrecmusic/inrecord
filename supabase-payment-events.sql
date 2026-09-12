-- ────────────────────────────────────────────────────────────────────────
-- 金流資料保存（2026-09-12）。冪等可重跑。
--
-- 1) payment_events：PAYUNi 背景通知（notify）的原始回呼全文落地。
--    在此之前，只有「付款成功（TradeStatus=1）」會被處理，而且只挑 4 個欄位寫回 orders；
--    ATM／超商下單後 PAYUNi 先回的「取號成功」通知（帶銀行代碼、虛擬帳號、繳費期限、超商繳費代碼）
--    整包被丟棄 → 要退 ATM 的款時，手上沒有學員的匯款資訊。
--    這張表把每一次回呼原樣存進 raw，未來 PAYUNi 加任何欄位都自動被保存。
--
-- 2) orders.refunded_at / refund_amount：退款時間與金額的專屬欄位。
--    原本只能靠 updated_at 推算，但 updated_at 有 trigger，任何後續操作（補寄信、開發票、
--    開通）都會蓋掉它 → 對帳會錯。
--
-- ⚠️ 沒跑這支 SQL 也不會壞掉（程式端全部安全降級）：
--    payment_events 寫入失敗只記 log、不影響 notify；退款會退回只寫 status。詳見 docs/payment-durability.md。
-- ────────────────────────────────────────────────────────────────────────

-- 1) PAYUNi 原始回呼紀錄
CREATE TABLE IF NOT EXISTS payment_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mer_trade_no    TEXT,         -- 我們的訂單編號（INREC…）；未知回呼可能為 NULL
  payuni_trade_no TEXT,         -- PAYUNi 交易序號（TradeNo）
  trade_status    TEXT,         -- PAYUNi TradeStatus 原值（'1'＝付款成功）
  pay_type        TEXT,         -- PaymentType／PayType 原值（'1' 信用卡、'2' ATM、'3' 超商代碼…）
  kind            TEXT,         -- 'paid' | 'code_issued'（ATM／超商取號）| 'other'
  raw             JSONB NOT NULL, -- 解密後的完整回呼參數（原樣保存，含虛擬帳號／繳費期限）
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 查某張訂單的所有回呼（退 ATM 款時找匯款資訊用），以及全站最近回呼（查帳／除錯）
CREATE INDEX IF NOT EXISTS payment_events_order_idx   ON payment_events (mer_trade_no, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_events_created_idx ON payment_events (created_at DESC);
-- ⚠️ 刻意不建唯一索引：同一筆訂單本來就會有多次回呼（取號 → 付款成功 → 重送），全部都要留。

ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_payment_events" ON payment_events;
CREATE POLICY "service_role_payment_events" ON payment_events
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 2) orders 退款欄位（退款當下寫入，不受 updated_at trigger 影響）
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_at   TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_amount INTEGER;
