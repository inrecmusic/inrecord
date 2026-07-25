-- 追蹤碼中心：單列設定表（比照 sale_settings 的 id='default' 慣例）
create table if not exists tracking_settings (
  id         text primary key default 'default',
  config     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into tracking_settings (id, config) values ('default', '{}'::jsonb)
  on conflict (id) do nothing;

-- 訂單歸因快照（last-touch UTM / click id / landing）
alter table orders add column if not exists attribution jsonb;
