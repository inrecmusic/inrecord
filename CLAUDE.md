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

首頁（`app/page.jsx`）為 Server Component（`revalidate=60`），價格與 CTA 文案由 `sale_settings` 表即時決定。`sale_settings` 採**多波段定價模型**：

- **`list_price`**（正式牌價）：刪除線錨點，也是所有波段結束後的常態售價。
- **`waves[]`**（波段陣列）：每個波段含 `starts_at`（含）/ `ends_at`（不含）/ 各方案價格，由 `lib/sale.js` 的 `salePhase(settings, now)` 依當下時間自動取價；波段價以 `Math.min` 不超過牌價。
- **其他欄位**：`open_at`（開課日）、`lock_override`（手動覆寫鎖站/開課）、`launch_notified_at`（開課通知是否已送出）。

**首頁三態**（由 `salePhase` 回傳的 `state` 決定）：

| 狀態 | 觸發條件 | UI 行為 |
|------|----------|---------|
| `pre_launch` | 第一個波段尚未開始（`waves` 非空時；無波段則為 `list`） | 不可購買；顯示「即將開賣」＋留信箱 |
| `wave` | 某波段進行中 | 可預購；顯示波段優惠價＋「下個波段漲價倒數」 |
| `list` | 所有波段結束 | 顯示正式牌價；開課後解鎖教室 |

checkout 以 `isOnSale`（= `state !== 'pre_launch'`）擋開賣前購買。後台「銷售設定」tab（在 `/admin` 內）改為牌價＋波段編輯器，可即時修改、**免重新部署**；API 端點為 `/api/admin/sale-settings`。購買前需先登入（`startBuy` 未登入會導向 `/classroom/login`）。

> 價格權威來源在後端 `lib/sale.js` 的 `currentPrice(plan, settings, now)` 與 `salePhase(settings, now)`（checkout 不信任前端傳入的 price）。**教室鎖站／開課信／開課通知仍由 `open_at` 驅動，與波段定價無關。**舊 `NEXT_PUBLIC_PRESALE_MODE` 環境變數已全面移除，不再使用。

### 銷售期間 / 教室鎖站（sale_settings 驅動）

銷售期間鎖站完全由 `sale_settings` 表的 `open_at` / `lock_override` 決定，邏輯集中於 `lib/sale.js`（`isClassroomOpen`）：

| `lock_override` | 行為 |
|-----------------|------|
| `'open'` | 強制開課（忽略 `open_at`） |
| `'locked'` | 強制鎖站（忽略 `open_at`） |
| `null`（依排程） | `open_at` ≤ now → 開課；否則鎖站 |

- **middleware**（`middleware.js`）60s module-scope cache 讀取 `sale_settings`，鎖站時將 `/classroom/*`（登入頁除外）redirect 至首頁。
- **購買信件**文案（「預購」vs「購買」）由 `sendPurchaseEmail({ ..., presale })` 依 `isClassroomOpen` 切換。
- **早鳥搶先看分層**（`lib/early-access.js`）：`EARLY_CUTOFF_MS`＝2026-09-02 00:00（台灣）之前付款／開通者為早鳥（音樂會預購），9/30（`FULL_RELEASE_MS`）前可看已上架章節；9/2 起購課者到 9/30 才開放正課影片（bootstrap 摘掉可播欄位、video-embed fail-closed 硬閘門；試看單元不受限）。例外用 `enrollments.early_override`（'early'|'standard'）。⚠️ 純手動開通且無 9/2 前訂單紀錄者會被判非早鳥，需設 override。
- **電子報退訂**：每封群發信帶 email 專屬 HMAC 連結（`lib/unsubscribe.js`）→ `/unsubscribe` 確認頁 → `POST /api/newsletter/unsubscribe` 寫 `newsletter_unsubscribes`；`gatherAudienceEmails` 排除；信件帶 `List-Unsubscribe` 標頭。只擋電子報，Auth／購課信不受影響。電子報亦可改用 Brevo 後台範本寄（後台下拉，`templateId`＋`params.unsubscribe_url`）。
- **開課通知**：`lib/sale.js` 的 `runLaunchNotify` 對 `orders.status='paid'` 的買家去重後寄出開課信，以 `launch_notified_at` CAS 冪等防重送；後台「立即寄送開課通知」鈕（`/api/admin/send-launch-notify`）與每日 cron（`/api/cron/sale-launch-notify`）均呼叫此函式。

## 架構決策（重要）

- **單一課程架構**：目前全站只有一門課。`chapters / videos / games` **沒有** `course_id` 欄位，後台「課程管理 → 管理教室」對所有課程顯示同一份章節/單元/遊戲；`courses` 表僅作課程清單 metadata；enrollments 以固定 `course_id='piano-101'` 開通。多課程遷移見 `docs/multi-course-migration.md`。
- **買斷制**：2026-05 起取消 AI 遊戲訂閱制，方案皆一次買斷、永久有效（`expires_at='2999-12-31'`）。
- **AI 遊戲管理**：併入後台「課程管理 → 管理教室」分頁（`app/admin/GamesManagePage.jsx`），非獨立選單。
- **退款流程**：`/api/admin/refund` 先試 PAYUNi `trade/close`（CloseType=2 請退款，**`TradeAmt` 依官方文件為請退款必填**，漏送會回 `CLOSE02010 未有請退款金額`），失敗則 fallback `trade/cancel`（取消授權）；成功後訂單轉 `refunded` 並撤銷對應 enrollments / subscriptions。帶 `manual:true` 則不呼叫 PAYUNi，只標記＋撤銷（款項已在 PAYUNi 商店後台退完時用，後台明細有「已在 PAYUNi 退款 → 標記」鈕）。失敗時回 PAYUNi 原始錯誤碼＋訊息（對照 docs.payuni.com.tw 錯誤代碼表），`CLOSE01007`＝商店 API 退款權限受限。共用加解密在 `lib/payuni.js`。
- **優惠券**：`coupons` 表 + `lib/plans.js`（`applyCoupon` 算折後價、`couponError` 驗證）。`BuyModal` 先打 `/api/coupons/validate` 顯示折扣，checkout **後端再驗證**並寫入 `orders.coupon_code`。**`used` 計次防 TOCTOU 重複折抵**：限量券（`usage_limit` 非 NULL）在 **checkout 當下用樂觀鎖 CAS 原子預扣**（`UPDATE…WHERE used=<讀到值>`；折扣此刻就寫進 PayUni `TradeAmt`，故額度必須在此消耗、不能等 notify）；無限量券不預扣，於 notify 付款成功才 +1（純統計）。放棄結帳佔住的限量名額由 cron **`/api/cron/release-coupons`** 逾時退回（pending→`expired` 且 `used-1`；閾值 `COUPON_RELEASE_AFTER_HOURS` 預設 72h，**須大於 PayUni ATM/超商付款期限**；notify 對 `expired` 訂單之付款會補回扣抵並寄告警 `late_paid`）。**履約/寄信去重旗標用 `orders.fulfilled_at`**，與「可重試的開發票（旗標 `invoice_no`）」分離——避免開票反覆失敗時每次重送 notify 都重複寄信。開票另以 `invoice_claimed_at` 原子 claim（NULL→now CAS）防 notify 並發／重送重複開票，失敗清回 null 可重試（後台手動開票 `issue-invoice` 亦共用此 claim）。正式 DB 已加此欄（migration `add_orders_invoice_claimed_at`）；新環境靠 `supabase-deploy.sql` 建。

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
  type TEXT NOT NULL DEFAULT 'percent',   -- 'percent' | 'fixed' | 'price'
  value INTEGER NOT NULL,                 -- percent: 1-100；fixed: NT$；price: 成交價 NT$
  used INTEGER NOT NULL DEFAULT 0,        -- 付款成功才累計
  usage_limit INTEGER,                    -- NULL = 無限制
  status TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'disabled'
  starts_at DATE, ends_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**指定價券（`type='price'`）**：`value` 為成交價，`applyCoupon` 回 `Math.max(0, Math.min(value, 基準價))`（基準價 = `currentPrice`，當下波段售價；不超過原價且不低於 0）；可加 `plan` 欄位鎖定方案（不符回 `coupon_wrong_plan`）。用於現場序號卡（$2,500）／粉絲序號（$3,499，皆 bundle）。checkout 對**有效指定價券繞過 `not_on_sale` 限制**（開賣前可兌換）；首頁 `pre_launch` 狀態有「輸入序號」兌換入口（`BuyModal` 未開賣模式）；後台優惠券／序號庫表單可建 `price` 型＋指定方案批次。`coupons` 表需加 `plan TEXT` 欄位（`ALTER TABLE coupons ADD COLUMN IF NOT EXISTS plan TEXT`）。

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

> **⚠️ 2026-08 起「自動開通」「自動開票」皆改 fail-safe 開關、預設關**（官網 payuni 直購改人工處理，與 concert/WordPress 一致）：
> - **`autoGrantEnabled()`（`lib/order-fulfillment.js`，`AUTO_GRANT_ACCESS==="on"` 才開、未設＝關）** gate 上面的開通分流——開關關時 notify **不寫 enrollments/subscriptions**，訂單只轉 `paid` ＋ 寄「預購成功」信（`presale` 恆 true）；開通改由後台「訂單管理→付款名單」三顆按鈕（逐筆/勾選/全數）人工處理（`POST /api/admin/grant-orders`，只開 `source=payuni`＋`course/bundle`＋未開通）。開通權威＝`enrollments`；判定純函式 `markEnrolled`/`pickUngrantedPayuni`（`lib/order-enrolled.js`），orders API 以 `selectAll` 分頁 join enrollments 帶 `enrolled`。
> - **`autoInvoiceEnabled()`（同檔，`AUTO_INVOICE==="on"` 才開）** gate notify 的 Amego 開票——關時付款後不自動開票、發票人工開立（見 `docs/superpowers/specs/2026-08-06-*`）。
> - 兩開關**各自獨立**；恢復自動＝Vercel 設對應 env＝`on` 後重部署。**CAPI／優惠券累計／寄信不受兩開關影響、照跑。**

### 遊戲存取驗證

1. classroom 登入後呼叫 `/api/classroom/verify-purchase`（課程）與 `/api/classroom/verify-subscription`（遊戲存取）。
2. `verify-subscription` 查 subscriptions 表，找最近一筆 `status='active'` 且 `expires_at > now()`，回傳 `{ hasSubscription, expiresAt, planType, daysLeft }`（永久存取 daysLeft 會很大，前端顯示「已開通」）。

### 遊戲防盜保護

- `GET /api/classroom/games` — 需 Bearer token（Supabase JWT）且 subscriptions 有效
- 返回遊戲 HTML 時加入浮水印（`user.email · InRecord`）與 iframe 防盜嵌入 script
- 遊戲資料存於 `games` 資料表（`id, title, chapter_id, html_content, sort_order`）

### 失敗告警（開票／寄信）

- 付款後 notify 若開發票或寄開課信失敗：落地 `orders.invoice_error` / `orders.email_error`，並即時寄 email 告警給 `ADMIN_EMAIL`（`lib/admin-alert.js`，純函式產信 + Brevo，內插值已 HTML 跳脫）。後台「訂單管理」頂部「待處理告警」面板集中顯示，可一鍵補開發票 / 補寄開課信（`/api/admin/issue-invoice`、`/api/admin/resend-email`）。
- notify 對失敗仍回 200（PAYUNi 不重送）、履約區有原子 claim，故告警無需去重旗標。

### 對帳彙整（後台訂單管理）

- OrdersPage 頂部「對帳彙整（依日期區間）」面板：套用既有日期篩選，顯示有效收款（已付款，退款已排除）、退款、待付款、付款方式分佈、發票已開/未開、優惠折抵，並可「匯出對帳 CSV」。彙整邏輯為純函式 `lib/reconciliation.js`（`summarizeOrders`，有測試），無新後端 API。

### 影片防盜保護（Bunny）

- 課程影片 embed URL 由 `/api/classroom/video-embed` 伺服器端簽發 Bunny Embed View Token（`SHA256_HEX(BUNNY_TOKEN_KEY + bunny_video_id + expires)`，預設 3h 到期），簽發前驗 Supabase JWT + enrollment。`lib/bunny.js` 為純函式（有測試）。缺 `BUNNY_TOKEN_KEY` 時回未簽 URL（平滑切換）。Vimeo legacy 維持未簽。**字幕預設開啟**：embed 參數 `captions=<語言代碼>`（`lib/bunny.js` 的 `DEFAULT_CAPTIONS`，現為 `CT`＝後台上傳的「繁體中文 (CT)」），代碼要對到影片實際上傳的字幕語言，對不到就不會顯示。
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
| `/api/admin/resend-email` | POST | 後台補寄開課確認信（Brevo） |
| `/api/admin/bunny-usage` | GET | 後台訂閱費用面板：Bunny 本月費用／流量／餘額（`lib/bunny-usage.js` 整理，伺服器快取 10 分） |
| `/api/admin/courses` | GET/POST/PATCH/DELETE | 後台課程 CRUD |
| `/api/admin/coupons` | GET/POST/PATCH/DELETE | 後台優惠券 CRUD |
| `/api/admin/sale-settings` | GET/PATCH | 後台銷售設定（open_at / list_price / waves[] / lock_override）|
| `/api/admin/send-launch-notify` | POST | 手動立即寄送開課通知（呼叫 runLaunchNotify，CAS 冪等防重送）|
| `/api/cron/sale-launch-notify` | GET | Bearer CRON_SECRET；每日自動觸發 + 首頁 ISR lazy trigger；開課後寄開課通知一次 |

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
BUNNY_ACCOUNT_API_KEY   # Bunny「帳號」層級 API key（後台訂閱費用面板即時抓 billing）；未設則退回 BUNNY_API_KEY（影片庫 key 會 401）
CRON_SECRET
COUPON_RELEASE_AFTER_HOURS   # 優惠券逾時釋放閾值(小時)，預設 72；須 > PayUni ATM/超商付款期限
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
NEXT_PUBLIC_WORDPRESS_BUY_URL   # /demo 體驗頁 CTA → WordPress 預購頁；未設則 CTA 顯示「即將開放」停用
# 廣告成效儀錶板（Phase 2）——未設則 cron no-op、儀錶板空狀態（不影響站台）
META_ADS_ACCESS_TOKEN   # Meta System User 長效 token（ads_read）
META_AD_ACCOUNT_ID      # act_ 開頭或純數字廣告帳戶 ID
META_API_VERSION        # 選填，預設 v25.0
META_TARGET_ROAS        # 選填，目標 ROAS 門檻，預設 3
# Meta CAPI 伺服器端轉換（notify webhook 送 Purchase）——未設則 skip、不影響金流；pixel id 讀 tracking_settings
META_CAPI_ACCESS_TOKEN  # Events Manager/System User 產的 CAPI token（有設 + meta 已啟用才送）
META_CAPI_TEST_CODE     # 選填，Events Manager「測試事件」驗證期間用，驗完清除
# 履約 fail-safe 開關（2026-08，皆預設關；未設＝不自動、改人工）——設 on 才恢復自動
AUTO_GRANT_ACCESS       # =on 才「付款即自動開通課程」；未設＝不開通、後台付款名單手動開通（只 payuni）
AUTO_INVOICE            # =on 才「付款後自動開 Amego 發票」；未設＝發票人工開立
```

## 部署需執行的 SQL

新環境依序執行 `supabase-schema.sql` → `supabase-schema-classroom.sql` / `supabase-schema-music.sql` → **`supabase-deploy.sql`**（彙整發票欄位 / coupons 表 / courses 表 / **`sale_settings` 表**，idempotent 可重複執行）→ **`supabase-classroom-features.sql`**（教室七大功能：`materials` 表＋`course-materials` 私有 bucket、`announcements` 表…；自帶 RLS service_role policy，分段 idempotent）→ **`supabase-tracking.sql`**（廣告追蹤碼中心：`tracking_settings` 表 + `orders.attribution` 欄，自帶 RLS service_role policy，idempotent）→ **`supabase-recovery.sql`**（未成交挽回信：`orders.recovery_sent_at` 欄，idempotent）→ **`supabase-ad-insights.sql`**（廣告成效儀錶板：`ad_insights` 表，自帶 RLS service_role policy，idempotent）→ **`supabase-capi.sql`**（Meta CAPI：`orders.capi_data` 欄，idempotent；⚠️checkout 每筆都寫此欄，**漏跑會讓所有結帳失敗**）→ **supabase-student-profiles.sql**（學員資料頁：student_profiles 表，自帶 RLS service_role policy，idempotent）→ **supabase-game-security.sql**（互動遊戲安全：game_devices／game_settings 表，自帶 RLS service_role policy，idempotent）→ **supabase-newsletter-unsubscribe.sql**（電子報退訂名單 `newsletter_unsubscribes`，自帶 RLS service_role policy，idempotent；未跑時群發照常 fail-open、但學員點退訂會報錯）→ **`supabase-hardening.sql`（必跑，最後一步）**。

> **廣告成效（Phase 2）**：Cron `sync-ad-insights`（每日 5:20）撈 Meta insights → `ad_insights`；後臺「廣告成效」分頁以 `utm_campaign` 對接真實訂單算 ROAS。**guarded on token**：未設 `META_ADS_ACCESS_TOKEN`/`META_AD_ACCOUNT_ID` 前 cron no-op、儀錶板顯示空狀態。⚠️ ROAS join 靠**投放時 ad URL 的 `utm_campaign` = Meta 活動名（正規化 trim+小寫）**——用 slug/id 會全對不上、board 讀虧損；且**廣告帳戶幣別須為 TWD**（與 `orders.amount` 一致）。

> Cron（`vercel.json`）：`release-coupons`（每日 4:00）、`sale-launch-notify`（每日 4:05）、`abandoned-recovery`（每日 5:00，未成交挽回信）。2026-08 起正式站已升 **Vercel Pro**，cron 不再受「每日一次」限制，可改任意排程。

> **函式區域**：`vercel.json` 的 `regions: ["hnd1"]`（東京）。刻意與 Supabase 的 `ap-northeast-1`（東京）同區——先前預設 `iad1`（美國華盛頓）會讓每次 DB 查詢橫跨太平洋。改動此值前先確認 Supabase 專案區域。

> ⚠️ `supabase-hardening.sql` 是安全收尾：subscriptions 冪等唯一索引 + 關閉 anon 對 `games`/`videos`/`ratings`/`comment_replies`/`rating_replies` 的公開讀。**漏跑這步，光憑公開 anon key 就能直接讀付費 `games.html_content`、`videos.bunny_video_id` 與評論者 `user_email`（PII）。** 全檔冪等可重複執行；跑完用檔內 2b 的 `pg_policies` 查詢確認已無任何 `{public}`／anon 讀取 policy。
