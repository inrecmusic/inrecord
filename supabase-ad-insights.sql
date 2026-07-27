create table if not exists ad_insights (
  platform      text not null default 'meta',
  campaign_id   text not null,
  campaign_name text,
  date          date not null,
  spend         numeric not null default 0,
  impressions   bigint  not null default 0,
  clicks        bigint  not null default 0,
  reach         bigint  not null default 0,
  frequency     numeric not null default 0,
  meta_conversions      numeric not null default 0,
  meta_conversion_value numeric not null default 0,
  currency      text default 'TWD',
  updated_at    timestamptz not null default now(),
  primary key (platform, campaign_id, date)
);
alter table ad_insights enable row level security;
drop policy if exists "service_role_ad_insights" on ad_insights;
create policy "service_role_ad_insights" on ad_insights
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
