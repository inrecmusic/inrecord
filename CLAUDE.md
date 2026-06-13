# InRecord — 零基礎流行鋼琴入門課

## 專案概覽

Next.js 14 App Router，部署在 Vercel。付款串接 PAYUNi 金流，資料庫使用 Supabase，Email 使用 Brevo。

## 方案與購買（買斷制，無訂閱）

在售方案皆為一次買斷、永久有效（已於 2026-05 取消 AI 遊戲訂閱制）：

| plan key | 方案 | 售價 | 開通內容 |
|----------|------|------|----------|
| `course` | 課程單賣 | NT$3,800 | 課程（enrollments）永久 |
| `bundle` | 課程包 AI（首頁主打） | NT$3,999 | 課程 + AI 遊戲永久 |

> **AI 練功房（`game`，NT$1,200 單買）已於 2026-06 下架**，僅保留上述兩方案。後端 `PLAN_CATALOG` 已移除 `game`（不再受理新單買），但 `notify` 依 `order.plan` 開通、不依賴 `PLAN_CATALOG`，故 **bundle 仍開通 AI 遊戲、既有/在途 `game` 訂單照常處理**；既有 `game` 訂閱存取權保留。admin 後台仍保留 `game` 顯示與手動開通（管理既有/legacy 資料）。

方案資料定義於 `app/page.jsx` 的 `PLANS` 陣列。首頁只有單一 `#pricing` 區、兩張卡，無 `#subscription` 區、無早鳥倒數。購買前需先登入（`startBuy` 未登入會導向 `/classroom/login`）。

> 價格權威來源在後端 `lib/plans.js` 的 `PLAN_CATALOG`（checkout 不信任前端傳入的 price）。

## 架構決策（重要）

- **單一課程架構**：目前全站只有一門課。`chapters / videos / games` **沒有** `course_id` 欄位，後台「課程管理 → 管理教室」對所有課程顯示同一份章節/單元/遊戲；`courses` 表僅作課程清單 metadata；enrollments 以固定 `course_id='piano-101'` 開通。多課程遷移見 `docs/multi-course-migration.md`。
- **買斷制**：2026-05 起取消 AI 遊戲訂閱制，方案皆一次買斷、永久有效（`expires_at='2999-12-31'`）。
- **AI 遊戲管理**：併入後台「課程管理 → 管理教室」分頁（`app/admin/GamesManagePage.jsx`），非獨立選單。
- **退款流程**：`/api/admin/refund` 先試 PAYUNi `trade/close`（CloseType=2 請退款），失敗則 fallback `trade/cancel`（取消授權）；成功後訂單轉 `refunded` 並撤銷對應 enrollments / subscriptions。共用加解密在 `lib/payuni.js`。
- **優惠券**：`coupons` 表 + `lib/plans.js`（`applyCoupon` 算折後價、`couponError` 驗證）。`BuyModal` 先打 `/api/coupons/validate` 顯示折扣，checkout **後端再驗證**並寫入 `orders.coupon_code`；`used` 於 notify 付款成功時才 +1。**去重旗標用 `orders.fulfilled_at`**（首次處理時先打旗標再做優惠券累計＋寄信），與「可重試的開發票（旗標為 `invoice_no`）」分離——避免開票反覆失敗時每次重送 notify 都把優惠券 +1／重複寄信。

### courses 資料表（後台課程管理）

```sql
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published', -- 'published' | 'draft'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### coupons 資料表（優惠券）

```sql
CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,              -- 大寫
  type TEXT NOT NULL DEFAULT 'percent',   -- 'percent' | 'fixed'
  value INTEGER NOT NULL,                 -- percent: 1-100；fixed: NT$
  used INTEGER NOT NULL DEFAULT 0,        -- 付款成功才累計
  usage_limit INTEGER,                    -- NULL = 無限制
  status TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'disabled'
  starts_at DATE, ends_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 優惠序號庫（coupon_batches）

現場活動限定序號：每組序號是一筆 `usage_limit=1` 的 `coupons`，靠 `batch_id` 歸入 `coupon_batches`（批次 metadata：折扣、前綴、備註、起訖）。**結帳/驗證/notify 累計流程與優惠券完全共用，零修改**——序號用一次即 `coupon_used_up` 失效。後台「優惠券」頁下方「序號庫」可批次自動產生（前綴＋數量，上限 500，CSPRNG 產碼且排除易混字 0/O/1/I）或手動補建、查看清單、全選複製、下載 CSV（含 BOM 與公式注入防護）。一般優惠券列表以 `.is("batch_id", null)` 排除序號。產碼/正規化/CSV 純邏輯在 `lib/serial-codes.js`（有單元測試）。API：`/api/admin/coupon-batches`（GET/POST/DELETE）、`/api/admin/coupon-batches/[id]/codes`（GET）。

### subscriptions 資料表（沿用為「遊戲存取」記錄）

遊戲存取權仍存於 subscriptions 表；「永久」以遠期到期日 `2999-12-31` 表示。

```sql
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  plan_type TEXT NOT NULL,          -- 'bundle' | 'game'（舊資料可能有 'monthly'|'yearly'|'gift'）
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,  -- 永久 = 2999-12-31
  payuni_order_id TEXT,
  source TEXT NOT NULL DEFAULT 'direct', -- 'purchase' | 'manual'（舊資料可能有 'purchase_gift'|'direct'）
  auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON subscriptions (email, status, expires_at);
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_subscriptions" ON subscriptions
  USING (auth.role() = 'service_role');
```

### 購買開通流程（PAYUNi）

1. `BuyModal` → `POST /api/payuni/checkout` `{ plan, price, label, email }`（email 必填，來自登入）；寫入 pending `orders`，MerTradeNo 格式 `INREC{timestamp}`。
2. PAYUNi 付款成功後背景通知 `POST /api/payuni/notify`，依 `order.plan` 分流：
   - `course` / `bundle` → upsert `enrollments`（課程永久）。
   - `game` / `bundle` → insert `subscriptions`（`expires_at=2999-12-31`、`source='purchase'`、`plan_type` 為 `bundle`/`game`），以 `source='purchase' + payuni_order_id` 做冪等。

### 遊戲存取驗證

1. classroom 登入後呼叫 `/api/classroom/verify-purchase`（課程）與 `/api/classroom/verify-subscription`（遊戲存取）。
2. `verify-subscription` 查 subscriptions 表，找最近一筆 `status='active'` 且 `expires_at > now()`，回傳 `{ hasSubscription, expiresAt, planType, daysLeft }`（永久存取 daysLeft 會很大，前端顯示「已開通」）。

### 遊戲防盜保護

- `GET /api/classroom/games` — 需 Bearer token（Supabase JWT）且 subscriptions 有效
- 返回遊戲 HTML 時加入浮水印（`user.email · InRecord`）與 iframe 防盜嵌入 script
- 遊戲資料存於 `games` 資料表（`id, title, chapter_id, html_content, sort_order`）

### 影片防盜保護（Bunny）

- 課程影片 embed URL 由 `/api/classroom/video-embed` 伺服器端簽發 Bunny Embed View Token（`SHA256_HEX(BUNNY_TOKEN_KEY + bunny_video_id + expires)`，預設 3h 到期），簽發前驗 Supabase JWT + enrollment。`lib/bunny.js` 為純函式（有測試）。缺 `BUNNY_TOKEN_KEY` 時回未簽 URL（平滑切換）。Vimeo legacy 維持未簽。
- 👤 上線需於 Bunny 後台開啟該函式庫 **Token Authentication** 並設定 **Allowed Referrers** 為正式網域。

## 主要 API 路由

| 路徑 | 方法 | 說明 |
|------|------|------|
| `/api/classroom/verify-purchase` | POST | 驗證課程購買 |
| `/api/classroom/verify-subscription` | POST | 驗證遊戲存取 |
| `/api/classroom/games` | GET | 遊戲清單/內容（需有效遊戲存取） |
| `/api/classroom/video-embed` | GET | 驗購買後簽發 Bunny 安全 embed URL（token+expires） |
| `/api/payuni/checkout` | POST | 方案付款（course/bundle，支援 couponCode；game 已下架） |
| `/api/payuni/notify` | POST | PAYUNi 背景通知（開通 + 開發票 + 累計優惠券） |
| `/api/coupons/validate` | POST | 公開：結帳前驗證優惠券、回傳折後價 |
| `/api/admin/subscriptions` | GET/POST/PATCH | 後台遊戲存取管理 |
| `/api/admin/orders` | GET | 後台訂單清單 |
| `/api/admin/refund` | POST | 退款（trade/close → fallback trade/cancel）+ 撤銷存取 |
| `/api/admin/issue-invoice` | POST | 後台手動開立發票（Amego） |
| `/api/admin/courses` | GET/POST/PATCH/DELETE | 後台課程 CRUD |
| `/api/admin/coupons` | GET/POST/PATCH/DELETE | 後台優惠券 CRUD |

## 速率限制（Rate Limiting）

公開端點的限流統一走 `lib/rate-limit.js` 的 `createDistributedLimiter`：**Upstash Redis 全域優先、記憶體保底**。有 Redis env → 跨 instance 精準 sliding window；缺 env 或 Redis 連線失敗 → 自動退回單機 `createRateLimiter`（記憶體型，多 instance 會繞過，僅基本防護），確保限流層故障不會擋掉正常請求。回 `429` 時帶 `Retry-After` header。IP 取自 `x-forwarded-for`（第一個）→ `x-real-ip`。

| 端點 | 門檻 | 用途 |
|------|------|------|
| `/api/invoice/validate` | 20 次/分 · IP | 擋手機條碼/統編枚舉；**並先做格式預檢**（不符就不外呼 Amego/g0v）|
| `/api/coupons/validate` | 30 次/分 · IP | 擋優惠碼/序號枚舉 |
| `/api/brevo/subscribe` | 5 次/分 · IP | 擋訂閱濫發/信箱轟炸 |
| `/api/admin/login` | 5 次**失敗**/15 分 · IP | 後台登入暴力破解；**只計失敗、成功不扣額** |

- **payuni `notify`/`return` 刻意不限流**（PAYUNi 回呼，已有 HashInfo 驗章），限流會擋掉付款通知。
- 新增公開端點要套限流時：`const limiter = createDistributedLimiter({ limit, windowMs, prefix: "rl:xxx" })`，在 handler 開頭 `await limiter(clientIp(req))`，`!allowed` 就回 429。每端點用獨立 `prefix`。

> **Upstash 環境變數命名陷阱**：Vercel Marketplace 的 Upstash 整合注入的是 **`KV_REST_API_URL` / `KV_REST_API_TOKEN`**（KV 命名），**不是** `UPSTASH_REDIS_REST_URL/TOKEN`。`getUpstash()` 已做相容：`KV_REST_API_*` 優先、`UPSTASH_REDIS_REST_*` 次之，兩種供裝方式皆可。免費方案命令額度對目前流量綽綽有餘。

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
BUNNY_TOKEN_KEY
CRON_SECRET
JWT_SECRET
ADMIN_EMAIL
ADMIN_PASSWORD
AMEGO_APP_KEY
AMEGO_IDENTIFIER
AMEGO_API_URL
BREVO_LIST_ID
# Upstash Redis（限流；Vercel Marketplace 整合自動注入 KV_ 命名，缺則退回記憶體限流）
KV_REST_API_URL
KV_REST_API_TOKEN
```

## 部署需執行的 SQL

新環境依序執行 `supabase-schema.sql` → `supabase-schema-classroom.sql` / `supabase-schema-music.sql` → **`supabase-deploy.sql`**（彙整發票欄位 / coupons 表 / courses 表，idempotent 可重複執行）。
