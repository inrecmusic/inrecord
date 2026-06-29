-- ════════════════════════════════════════════════════════════════════════
-- InRecord — 部署需執行的 SQL（彙整清單）
-- ════════════════════════════════════════════════════════════════════════
--
-- 使用方式：
--   1. 打開 Supabase → SQL Editor → New query
--   2. 整份貼上、按 Run（全部為 IF NOT EXISTS / idempotent，可安全重複執行）
--
-- 內含四組變更：
--   ①  發票（Amego）         — orders 表新增發票相關欄位
--   ②  優惠券                — coupons 表 + orders.coupon_code
--   ③  課程管理              — courses 表（含預設課程種子）
--   ④  銷售期間設定          — sale_settings 表（單列；開課日/早鳥/各方案價/手動覆寫）
--
-- 前置：本檔假設 orders 表已存在（見 supabase-schema.sql）。
-- 對應的單獨檔案：
--   ① supabase-schema-invoice.sql
--   ② supabase-schema-coupons.sql
--   ③ supabase-schema-courses.sql
-- ════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────
-- ① 發票（Amego 電子發票）：orders 欄位
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS invoice_no    TEXT,
  ADD COLUMN IF NOT EXISTS buyer_name    TEXT,
  ADD COLUMN IF NOT EXISTS buyer_tax_id  TEXT,
  ADD COLUMN IF NOT EXISTS carrier_type  TEXT,
  ADD COLUMN IF NOT EXISTS carrier_id    TEXT,
  ADD COLUMN IF NOT EXISTS invoice_error TEXT,        -- 最後一次開票失敗原因（成功時清為 null）
  ADD COLUMN IF NOT EXISTS email_error   TEXT,        -- 最後一次寄開課信失敗原因（成功時清為 null）
  ADD COLUMN IF NOT EXISTS fulfilled_at  TIMESTAMPTZ; -- 首次付款成功處理時間；作為優惠券累計／寄信的去重旗標（與可重試的開發票分離）

-- 粉絲限定憑證折價：訂單帶憑證與審核狀態（idempotent）
ALTER TABLE orders ADD COLUMN IF NOT EXISTS proof_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fan_review TEXT;   -- NULL=非粉絲單；'pending'|'approved'|'rejected'
ALTER TABLE orders ADD COLUMN IF NOT EXISTS phone TEXT;        -- 買家手機（WooCommerce / concert webhook 進名單帶入）


-- ────────────────────────────────────────────────────────────────────────
-- ② 優惠券：coupons 表 + orders.coupon_code
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coupons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  code        TEXT NOT NULL UNIQUE,            -- 優惠碼（大寫）
  type        TEXT NOT NULL DEFAULT 'percent', -- 'percent' | 'fixed' | 'price'
  value       INTEGER NOT NULL,                -- percent: 1-100；fixed: NT$；price: 指定成交價 NT$
  used        INTEGER NOT NULL DEFAULT 0,      -- 已使用次數（付款成功才累計）
  usage_limit INTEGER,                         -- NULL = 無限制
  status      TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'disabled'
  plan        TEXT,                            -- 鎖定方案 'course'|'bundle'；NULL = 不限
  starts_at   DATE,                            -- NULL = 不限開始
  ends_at     DATE,                            -- NULL = 不限結束
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS coupons_code_idx ON coupons (code);
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_coupons" ON coupons;
CREATE POLICY "service_role_coupons" ON coupons
  USING (auth.role() = 'service_role');

ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;

-- WordPress(WooCommerce) 現場購買橋接：訂單來源 + 後台手動寄信/開通的去重旗標
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS source                TEXT NOT NULL DEFAULT 'payuni', -- 'payuni' | 'wordpress'
  ADD COLUMN IF NOT EXISTS presale_email_sent_at TIMESTAMPTZ,                     -- WordPress 預購信已寄時間（null=未寄）
  ADD COLUMN IF NOT EXISTS access_granted_at     TIMESTAMPTZ;                     -- WordPress 手動開通存取時間（null=未開通）


-- ────────────────────────────────────────────────────────────────────────
-- ③ 課程管理：courses 表（含預設課程種子）
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT,
  price       INTEGER NOT NULL DEFAULT 0,        -- 新台幣，整數
  status      TEXT NOT NULL DEFAULT 'published', -- 'published' | 'draft'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_courses" ON courses;
CREATE POLICY "service_role_courses" ON courses
  USING (auth.role() = 'service_role');

-- 預設帶入現有的單一課程（若 courses 已有任何資料則略過）
INSERT INTO courses (title, description, price, status)
SELECT '零基礎流行鋼琴入門課', '從零開始學習流行鋼琴，包含基礎樂理、和弦節奏與歌曲實作', 3800, 'published'
WHERE NOT EXISTS (SELECT 1 FROM courses);

-- ════════════════════════════════════════
-- 優惠序號庫：coupon_batches 表 + coupons.batch_id
-- 序號 = usage_limit=1 的 coupon；結帳流程與優惠券共用
-- ════════════════════════════════════════
CREATE TABLE IF NOT EXISTS coupon_batches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,                   -- 例：2026 春季演奏會
  type        TEXT NOT NULL DEFAULT 'percent', -- 'percent' | 'fixed' | 'price'
  value       INTEGER NOT NULL,                -- percent: 1-100；fixed: NT$；price: 指定成交價 NT$
  prefix      TEXT,                            -- 序號前綴，例 LIVE
  note        TEXT,                            -- 活動備註
  plan        TEXT,                            -- 鎖定方案 'course'|'bundle'；NULL = 不限
  starts_at   DATE,
  ends_at     DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE coupon_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_coupon_batches" ON coupon_batches;
CREATE POLICY "service_role_coupon_batches" ON coupon_batches
  USING (auth.role() = 'service_role');

ALTER TABLE coupons ADD COLUMN IF NOT EXISTS batch_id UUID
  REFERENCES coupon_batches(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS coupons_batch_idx ON coupons (batch_id);

-- ════════════════════════════════════════
-- 銷售期間設定 sale_settings（單列）
-- 開課日/波段定價/手動覆寫/開課通知冪等旗標
-- ════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sale_settings (
  id                 TEXT PRIMARY KEY DEFAULT 'default',
  open_at            TIMESTAMPTZ,
  list_price         JSONB NOT NULL DEFAULT '{}'::jsonb,
  list_anchor        JSONB NOT NULL DEFAULT '{}'::jsonb,
  waves              JSONB NOT NULL DEFAULT '[]'::jsonb,
  lock_override      TEXT,
  launch_notified_at TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sale_settings_singleton CHECK (id = 'default'),
  CONSTRAINT sale_settings_lock_override_chk
    CHECK (lock_override IS NULL OR lock_override IN ('open','locked'))
);

INSERT INTO sale_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;
-- 劃線原價（劃線錨點，與「波段後常態售價 list_price」分離；既有環境補欄位，idempotent）
ALTER TABLE sale_settings ADD COLUMN IF NOT EXISTS list_anchor JSONB NOT NULL DEFAULT '{}'::jsonb;
-- 粉絲限定方案後台設定（enabled/deadline/proof_price/direct_price），缺值由 getFanPlan fallback
ALTER TABLE sale_settings ADD COLUMN IF NOT EXISTS fan_plan JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE sale_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_write_sale_settings" ON sale_settings;
CREATE POLICY "service_role_write_sale_settings" ON sale_settings
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- SELECT 刻意對 public 開放（開課日/價格本就公開顯示；供 middleware 用 anon 讀）。
DROP POLICY IF EXISTS "public_read_sale_settings" ON sale_settings;
CREATE POLICY "public_read_sale_settings" ON sale_settings
  FOR SELECT USING (true);

-- 遷移：既有 sale_settings 從單一早鳥 → 波段模型
ALTER TABLE sale_settings ADD COLUMN IF NOT EXISTS list_price JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE sale_settings ADD COLUMN IF NOT EXISTS waves      JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE sale_settings DROP COLUMN IF EXISTS plan_pricing;
ALTER TABLE sale_settings DROP COLUMN IF EXISTS early_bird_ends_at;

-- 遷移：指定價通路（Sub-2）
ALTER TABLE coupons        ADD COLUMN IF NOT EXISTS plan TEXT;
ALTER TABLE coupon_batches ADD COLUMN IF NOT EXISTS plan TEXT;


-- ────────────────────────────────────────────────────────────────────────
-- ⑤ 電子報：newsletter 單列草稿（後台編輯 → 群發給學員）
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS newsletter (
  id              TEXT PRIMARY KEY DEFAULT 'default',
  subject         TEXT NOT NULL DEFAULT '',
  body_md         TEXT NOT NULL DEFAULT '',
  last_sent_at    TIMESTAMPTZ,
  last_sent_count INTEGER NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT newsletter_singleton CHECK (id = 'default')
);
INSERT INTO newsletter (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;
ALTER TABLE newsletter ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_newsletter" ON newsletter;
CREATE POLICY "service_role_newsletter" ON newsletter
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────────────────
-- ⑥ 電子報寄送記錄：群發去重 + 真正的每日上限（跨多次呼叫累計）
--    content_hash = 該封電子報 subject+body 的指紋（見 lib/newsletter-send.js contentHash）。
--    同一封內容對同一 email 只記一次 → timeout 重跑 / 重複點擊不會重寄；
--    每日上限改以「今日實際已寄筆數」為準（countSentToday）。
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS newsletter_sends (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash TEXT NOT NULL,
  email        TEXT NOT NULL,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS newsletter_sends_hash_email_idx ON newsletter_sends (content_hash, email);
CREATE INDEX IF NOT EXISTS newsletter_sends_sent_at_idx ON newsletter_sends (sent_at);
ALTER TABLE newsletter_sends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_newsletter_sends" ON newsletter_sends;
CREATE POLICY "service_role_newsletter_sends" ON newsletter_sends
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────────────────
-- ⑥b 開課通知逐封寄送記錄（per-email 去重 / 斷點續寄）
--    舊版「寄前就設 launch_notified_at」一逾時就把旗標標成已通知卻沒寄完、不可逆 →
--    多數買家收不到開課信。改 per-email 記錄：唯一索引保證同一人只記一次，逾時重跑/
--    每日 cron 自動續寄；全部寄達才設 sale_settings.launch_notified_at（見 lib/launch-notify.js）。
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS launch_notify_sends (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email   TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS launch_notify_sends_email_idx ON launch_notify_sends (lower(email));
ALTER TABLE launch_notify_sends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_launch_notify_sends" ON launch_notify_sends;
CREATE POLICY "service_role_launch_notify_sends" ON launch_notify_sends
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────────────────
-- ⑥c 後台操作稽核紀錄（audit log）：對金錢/存取權/個資敏感操作落 who/what/when/target/meta/ip。
--    見 lib/audit.js。僅 service_role 可讀寫。
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_email TEXT,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  meta        JSONB,
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON admin_audit_log (created_at DESC);
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_admin_audit_log" ON admin_audit_log;
CREATE POLICY "service_role_admin_audit_log" ON admin_audit_log
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────────────────
-- ⑥d 站內可編輯內容（隱私權政策/服務條款）：後台編輯存 DB、前台讀 DB（無則用程式內 fallback）。
--    解決舊版「編輯器只存 localStorage、改了不影響正式頁」的假性功能。key: 'privacy' | 'terms'。
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_content (
  key        TEXT PRIMARY KEY,
  body_md    TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE site_content ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_site_content" ON site_content;
CREATE POLICY "service_role_site_content" ON site_content
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────────────────
-- ⑦ 課程評價：每位使用者一筆（先清重複、再建唯一索引）
--    rating route 為「先查後插」，並發仍可能各插一筆 → 污染首頁平均分。
--    先刪除每個 user_id 的重複（保留最新一筆），再建 partial unique index；
--    之後並發第二筆會撞 23505 → route 回 already_rated。idempotent：無重複時 DELETE 不動任何列。
-- ────────────────────────────────────────────────────────────────────────
DELETE FROM ratings r
WHERE r.user_id IS NOT NULL
  AND r.id NOT IN (
    SELECT DISTINCT ON (user_id) id FROM ratings
    WHERE user_id IS NOT NULL
    ORDER BY user_id, created_at DESC
  );
CREATE UNIQUE INDEX IF NOT EXISTS ratings_user_unique ON ratings (user_id) WHERE user_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────
-- ⑧ 進度原子更新 RPC：取代 route 的 read-modify-write，避免並發互相覆蓋遺失進度。
--    watched/total 取 GREATEST、completed 取 OR；以 UNIQUE(user_id,video_id) 做 upsert。
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_progress(
  p_user_id UUID, p_video_id UUID, p_watched INTEGER, p_total INTEGER, p_completed BOOLEAN
) RETURNS public.progress
LANGUAGE sql
AS $$
  INSERT INTO public.progress (user_id, video_id, watched_seconds, total_seconds, completed, watched_at)
  VALUES (p_user_id, p_video_id, GREATEST(p_watched, 0), GREATEST(p_total, 0), p_completed, NOW())
  ON CONFLICT (user_id, video_id) DO UPDATE SET
    watched_seconds = GREATEST(progress.watched_seconds, EXCLUDED.watched_seconds),
    total_seconds   = GREATEST(progress.total_seconds, EXCLUDED.total_seconds),
    completed       = progress.completed OR EXCLUDED.completed,
    watched_at      = NOW()
  RETURNING *;
$$;
