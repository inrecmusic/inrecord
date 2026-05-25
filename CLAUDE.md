# InRecord — 零基礎流行鋼琴入門課

## 專案概覽

Next.js 14 App Router，部署在 Vercel。付款串接 PAYUNi 金流，資料庫使用 Supabase，Email 使用 Brevo。

## AI 遊戲訂閱制

### subscriptions 資料表

```sql
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  plan_type TEXT NOT NULL,          -- 'monthly' | 'yearly' | 'gift'
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  payuni_order_id TEXT,
  source TEXT NOT NULL DEFAULT 'direct', -- 'direct' | 'purchase_gift' | 'manual'
  auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON subscriptions (email, status, expires_at);
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_subscriptions" ON subscriptions
  USING (auth.role() = 'service_role');
```

### 定價方案

| 方案 | 月繳 | 年繳 |
|------|------|------|
| 價格 | NT$399 / 月 | NT$1,499 / 年 |
| 省下 | — | NT$3,289（相當於 8 個月免費）|

### 訂閱驗證流程

1. 前端（classroom/page.jsx）登入後同時呼叫 `/api/classroom/verify-purchase` 和 `/api/classroom/verify-subscription`
2. `verify-subscription` 查詢 subscriptions 表，找最近一筆 `status='active'` 且 `expires_at > now()` 的紀錄
3. 返回 `{ hasSubscription, expiresAt, planType, daysLeft }`

### 購課贈送 3 個月邏輯

- 在 `app/api/payuni/notify/route.js`，付款成功且訂單非訂閱方案（plan 不以 `sub_` 開頭）時，自動寫入一筆 `plan_type='gift'`、`source='purchase_gift'`、3 個月有效的訂閱

### 訂閱付款（PAYUNi）

- Checkout: `POST /api/payuni/subscribe` `{ plan: 'monthly'|'yearly', email }`
- MerTradeNo 格式: `INRECSUB{timestamp}`
- Notify handler 偵測 plan 以 `sub_` 開頭時處理訂閱邏輯（延長現有到期日）

### 遊戲防盜保護

- `GET /api/classroom/games` — 需 Bearer token（Supabase JWT）且 subscriptions 有效
- 返回遊戲 HTML 時加入浮水印（`user.email · InRecord`）與 iframe 防盜嵌入 script
- 遊戲資料存於 `games` 資料表（`id, title, chapter_id, html_content, sort_order`）

### 到期提醒 Cron

- `GET /api/cron/subscription-reminder`（需 Authorization: Bearer CRON_SECRET）
- 每天 09:00 執行（vercel.json cron）
- 查詢 7 天內到期的訂閱，透過 Brevo 寄送提醒信

## 主要 API 路由

| 路徑 | 方法 | 說明 |
|------|------|------|
| `/api/classroom/verify-purchase` | POST | 驗證課程購買 |
| `/api/classroom/verify-subscription` | POST | 驗證遊戲訂閱 |
| `/api/classroom/games` | GET | 遊戲清單/內容（需訂閱） |
| `/api/payuni/checkout` | POST | 課程付款 |
| `/api/payuni/subscribe` | POST | 訂閱付款 |
| `/api/payuni/notify` | POST | PAYUNi 背景通知 |
| `/api/cron/subscription-reminder` | GET | 到期提醒（Cron） |
| `/api/admin/subscriptions` | GET/POST/PATCH | 後台訂閱管理 |

## 環境變數

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
PAYUNI_MERCHANT_ID
PAYUNI_HASH_KEY
PAYUNI_HASH_IV
PAYUNI_API_URL
BREVO_API_KEY
BREVO_SENDER_EMAIL
BREVO_SENDER_NAME
NEXT_PUBLIC_SITE_URL
CRON_SECRET
JWT_SECRET
ADMIN_EMAIL
ADMIN_PASSWORD
```
