-- 追蹤碼中心：單列設定表（比照 sale_settings 的 id='default' 慣例）
create table if not exists tracking_settings (
  id         text primary key default 'default',
  config     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into tracking_settings (id, config) values ('default', '{}'::jsonb)
  on conflict (id) do nothing;

-- 安全：全站僅 service_role 讀寫（getSupabaseAdmin）；RLS 擋 anon/authenticated
-- 直接竄改 pixel 設定（否則可繞過 app 層 SAFE_ID 驗證、把轉換導向他人 pixel）
alter table tracking_settings enable row level security;
drop policy if exists "service_role_tracking_settings" on tracking_settings;
create policy "service_role_tracking_settings" on tracking_settings
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- 訂單歸因快照（last-touch UTM / click id / landing）；orders 既有 RLS 不變
alter table orders add column if not exists attribution jsonb;
