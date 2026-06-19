# 銷售期間自動切換 CTA — 設計文件

> 日期：2026-06-20　狀態：設計定案，待寫實作計畫

## 1. 背景與目標

目前官網的銷售狀態完全靠**手動 + 重新部署**：

- 兩個方案價格寫死在 `app/page.jsx` 的 `PLANS`（`course` 3,800／`bundle` 3,999），權威價在後端 `lib/plans.js` 的 `PLAN_CATALOG`。
- 唯一的「檔期」機制是環境變數 `NEXT_PUBLIC_PRESALE_MODE`，控制三處：教室鎖站（`middleware.js`）、首頁 CTA（`app/page.jsx`）、開課信文案（`lib/brevo-email.js`）。改它要**手動改 env 並重新部署**。

**目標**：營運者在後台設定「開課日、早鳥截止日、各方案原價/早鳥價」後，官網的 CTA、價格、教室鎖站、開課通知信會**依當下時間自動切換，免重新部署**。

## 2. 範圍

**包含**

1. 首頁 CTA／價格依銷售階段自動切換。
2. 教室鎖站依「開課日」自動開關（取代 `NEXT_PUBLIC_PRESALE_MODE`）。
3. 開課日到達時，自動寄「開課了」通知信給**已預購買家**。
4. 後台新增「銷售設定」頁可自助設定上述參數。

**不包含（YAGNI）**

- 限時／可重複開團的銷售檔期（本案為「一次性上市」：開課後永久販售，無停售）。
- 開課通知寄給「未購買者／電子報訂閱者」（僅寄已預購買家，純履約信）。
- 以「限量名額」觸發早鳥結束（僅以日期觸發）。

## 3. 已確認決策

| 項目 | 決定 |
|------|------|
| 時間軸模型 | 一次性上市：**開課日**（解鎖教室）＋**早鳥截止日**（價格回原價），兩者獨立 |
| 購買開放期 | 全程開放（開課前＝預購、開課後＝正式），購買動作不因階段中斷 |
| 早鳥價形式 | **每個方案各設一個明確金額**（非全站百分比） |
| 設定介面 | 後台 `/admin` 新增「銷售設定」分頁 |
| 開課通知對象 | 僅已預購買家（`orders.status='paid'` 去重 email） |
| 架構 | 單一真相來源放 Supabase；middleware 用短快取讀（方案 1，不引入 Edge Config） |
| Vercel 方案 | **Hobby（免費）**，cron 僅每日一次 → 開課通知改用「到訪者觸發＋後台手動鈕」 |
| 手動覆寫 | 後台提供「依排程／強制開課／強制鎖站」安全閥；未設開課日時預設＝鎖站 |

## 4. 時間軸模型

兩個獨立的時間開關，組成 2×2 階段：

- `classroomOpen = now >= open_at`（或被 `lock_override` 覆寫）→ 控制教室鎖站、Nav 文案、信件「預購/購買」文案。
- `earlyBird = now < early_bird_ends_at`→ 控制價格（早鳥價／原價）。

| | 早鳥期內 | 早鳥已過 |
|---|---|---|
| **開課前（預購）** | 標籤「預購中・早鳥優惠」｜早鳥價（原價刪除線）｜鈕「立即預購」｜Nav「課程準備中」 | 「預購中」｜原價｜「立即預購」 |
| **已開課** | 「早鳥優惠」｜早鳥價（刪除線）｜鈕「立即購買」｜Nav「進入教室」 | 原價｜「立即購買」（穩定態） |

## 5. 資料模型

### 5.1 `sale_settings`（單列設定表）

```sql
CREATE TABLE IF NOT EXISTS sale_settings (
  id                 TEXT PRIMARY KEY DEFAULT 'default',
  open_at            TIMESTAMPTZ,        -- 開課日（NULL = 尚未設定 = 鎖站）
  early_bird_ends_at TIMESTAMPTZ,        -- 早鳥截止日（NULL = 無早鳥，一律原價）
  plan_pricing       JSONB NOT NULL DEFAULT '{}',  -- { "course":{"original":3800,"earlyBird":3200}, "bundle":{...} }
  lock_override      TEXT,               -- NULL=依排程 | 'open' | 'locked'
  launch_notified_at TIMESTAMPTZ,        -- 開課通知信冪等旗標（寄過即有值）
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sale_settings_singleton CHECK (id = 'default'),
  CONSTRAINT sale_settings_lock_override_chk
    CHECK (lock_override IS NULL OR lock_override IN ('open','locked'))
);

-- 預設單列（idempotent）
INSERT INTO sale_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

ALTER TABLE sale_settings ENABLE ROW LEVEL SECURITY;
-- 寫入限 service_role
DROP POLICY IF EXISTS "service_role_write_sale_settings" ON sale_settings;
CREATE POLICY "service_role_write_sale_settings" ON sale_settings
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
-- SELECT 刻意對 public 開放（內容皆會公開顯示，無敏感資料；供 middleware 用 anon key 讀）
DROP POLICY IF EXISTS "public_read_sale_settings" ON sale_settings;
CREATE POLICY "public_read_sale_settings" ON sale_settings
  FOR SELECT USING (true);
```

> **安全說明**：這是本案唯一刻意對 public 開放讀取的表，與 `supabase-hardening.sql` 封掉 `games`/`videos` 的原則不衝突——本表只有開課日與價格，都會公開顯示於首頁。寫入仍嚴格限 `service_role`。
>
> 放入 `supabase-deploy.sql`（idempotent），新環境部署時一併建立。

## 6. 共用邏輯 `lib/sale.js`（純函式 + 單元測試）

比照 `lib/reconciliation.js`／`lib/serial-codes.js`／`lib/bunny.js`，邏輯抽純函式以利測試。

```js
// 皆吃 (settings, now=new Date())；settings 可能為 null（fallback）
isClassroomOpen(settings, now)   // override 優先：'open'→true、'locked'→false；
                                 // 否則 settings?.open_at && now >= open_at；無 open_at → false
isEarlyBird(settings, now)       // !!early_bird_ends_at && now < early_bird_ends_at
currentPrice(plan, settings, now)// 早鳥中且該方案有 earlyBird → earlyBird；否則 original；
                                 // settings/方案缺 → fallback PLAN_CATALOG[plan].price
salePhase(settings, now)         // { classroomOpen, earlyBird }（給前端決定文案）
isPresale(settings, now)         // = !isClassroomOpen(settings, now)（信件/CTA 用）
```

**測試重點**：override 三態、open_at 邊界（恰好等於 now）、early-bird 邊界、缺欄位/缺整包 settings 的 fallback、earlyBird 金額為 null 時退原價。

讀取函式（有副作用，另置，非純函式）：

```js
getSaleSettings()  // service-role 讀單列；給 server component / 後端 API / cron 用
```

## 7. 後端改動

三處都只改「讀取來源」，不動既有分支邏輯。

### 7.1 `app/api/payuni/checkout/route.js`（價格權威）

- 第 46 行 `let price = catalog.price;` → `let price = currentPrice(plan, settings, new Date());`（`settings` 由 `getSaleSettings()` 取得）。
- **早鳥/原價的判定在後端**，前端傳入的價格仍一律不信任（現況本就未讀 `body.price`）。
- 優惠券疊加：`applyCoupon(price, coupon)` 套在 `currentPrice` 之上，限量券 CAS 預扣邏輯**完全不動**。
- `catalog.label` 仍取自 `PLAN_CATALOG`（品名）。

### 7.2 `lib/brevo-email.js`（信件文案來源）

- 第 72 行 `const presale = process.env.NEXT_PUBLIC_PRESALE_MODE === "1";` 移除。
- `sendPurchaseEmail` 新增可選參數 `presale`（由呼叫端 `app/api/payuni/notify` 用 `isPresale(settings, now)` 算好傳入）。
- `buildHtml` 的 presale 分支與主旨切換**完全不動**。

### 7.3 `middleware.js`（教室鎖站）

- 第 10 行 `presaleMode = env.PRESALE_MODE` → `const locked = !isClassroomOpen(settings, now);`
- `settings` 透過 **module-scope 60 秒 TTL 快取**讀取（middleware 用既有 anon `createServerClient`，靠 public SELECT policy）：
  ```
  let _cache = { value: null, at: 0 };
  async function readSettingsCached() {
    if (Date.now() - _cache.at < 60_000 && _cache.value !== null) return _cache.value;
    try { /* anon select sale_settings 單列 */ _cache = { value, at: Date.now() }; }
    catch { /* 失敗時：沿用舊值；無舊值 → 回 null（→ 鎖站，與「未設開課日」一致） */ }
    return _cache.value;
  }
  ```
- bypass token（`PRESALE_BYPASS_TOKEN` + `inrec_preview` cookie）、`matcher` 全部保留。

> **註**：middleware 鎖站僅為 UX 入口閘；教室內容的真正保護在 classroom API（驗 JWT + enrollment）。故快取失效短暫誤判不致外洩付費內容。

### 7.4 `NEXT_PUBLIC_PRESALE_MODE` 退場

三處引用改完後，此 env 不再使用，可自 Vercel 移除（移除前先確認三處皆已改）。

## 8. 前端首頁

`app/page.jsx` 目前是 `"use client"`、價格寫死、`presaleMode` 於 build 時固定。

- **`app/page.jsx` → server component**：`export const revalidate = 60;`，呼叫 `getSaleSettings()`，用 `salePhase()`/`currentPrice()` 算出 `sale = { classroomOpen, earlyBird, openAt, earlyBirdEndsAt, plans:[{plan,label,price,originalPrice,isEarlyBird,...}] }`，render `<HomeClient sale={sale} />`。
- **`app/HomeClient.jsx`（新增，`"use client"`）**：搬入現有畫面，價格與文案改吃 `props.sale`。`PLANS` 保留為靜態 metadata（label/pillLabel/desc/features/ribbon），價格由 `sale` 注入。
- 受影響的 UI：
  - Nav 登入鈕（`page.jsx:444-448, 460-464`）：`presaleMode` → `!sale.classroomOpen`。
  - 方案卡價格（`page.jsx:691-710`）：顯示現價；早鳥中加原價刪除線 + 「早鳥優惠」標籤。
  - 購買鈕字（nav/hero/cta/sticky）：依 `classroomOpen` 切「立即預購／立即購買」。
  - sticky bar 硬編碼 `NT$3,999`（`page.jsx:764`）→ 吃 `sale`。
  - （選配）開課前顯示「開課日 X/X」與早鳥倒數。
- 60 秒 ISR ＋ middleware 60 秒快取 = 切換當下約 1 分鐘內全站一致，免重新部署。

## 9. 後台 UI

### 9.1 `app/admin/SaleSettingsPage.jsx`（新增）

掛進 `app/admin/page.jsx` 既有 tab 機制，新增「銷售設定」分頁。表單欄位：

- 開課日、早鳥截止日（`datetime-local`，以台灣時間輸入，送出轉 ISO/UTC）。
- 各方案原價／早鳥價（數字）。
- 手動覆寫（radio：依排程／強制開課／強制鎖站）。
- 顯示目前計算出的階段與現價（即時預覽），以及 `launch_notified_at`（已寄送開課通知的時間，或「尚未寄送」+「立即寄送開課通知」鈕）。

### 9.2 `app/api/admin/sale-settings/route.js`（新增）

- `GET`：讀單列。`PATCH`：upsert 單列（`id='default'`）。
- 沿用 `verifyAdminToken(req)` + `getSupabaseAdmin()`（比照 `app/api/admin/coupons/route.js`）。
- 後端驗證：金額為非負整數、`early_bird_ends_at`/`open_at` 可為空、`lock_override ∈ {null,'open','locked'}`。

## 10. 開課自動通知（Hobby 方案機制）

端點：`app/api/cron/sale-launch-notify/route.js`，鏡像 `release-coupons` 的 `Authorization: Bearer <CRON_SECRET>` 驗證。

**流程（冪等）**：

1. 讀 `sale_settings`；若 `isClassroomOpen(settings, now)` 為真（即課程已開放）且 `launch_notified_at IS NULL` 才繼續。
   - 用 `isClassroomOpen`（非僅 `now >= open_at`）故 `lock_override='locked'` 時**不會誤發**；`lock_override='open'`（提前開課）則會發送開課通知——若只是想靜默預覽請改用 bypass token（`?preview=`），不要用 `override='open'`。
2. **CAS 原子搶佔**：`UPDATE sale_settings SET launch_notified_at=now() WHERE id='default' AND launch_notified_at IS NULL`，回傳 0 列代表已被搶佔 → 結束（保證只寄一次）。
3. 撈 `orders WHERE status='paid'` 的 email，去重，批次寄「開課了」信（新 Brevo 文案：課程已開放、可用購買 email 登入）。
4. 回傳 `{ sent, alreadyNotified }`。

**觸發來源（免費方案無法 sub-daily cron）**：

- **主要：到訪者觸發** — 首頁 server 端資料抓取（`getSaleSettings()` 後）若偵測 `sale.classroomOpen && !launch_notified_at`，以 fire-and-forget `fetch` 打此端點（帶 `CRON_SECRET`）。首位開課後到訪者即觸發；開課後到 CAS 落定前的短窗內多名訪客可能各打一次，皆由 CAS 收斂為只寄一次。
- **保底：後台手動鈕**「立即寄送開課通知」 — 經 admin-authed 路由轉呼此端點（帶 secret）。即使零流量也能由營運者手動送。
- **（選配）每日 cron 保底** — 若 Hobby 允許第二個每日 cron，於 `vercel.json` 加 `/api/cron/sale-launch-notify`（每日）；否則略過（到訪者觸發 + 手動鈕已足夠）。

**對象**：`orders.status='paid'` 去重 email（開課前的預購買家）。開課後新購買者由既有 `notify` 流程即時寄「購買成功」信，不在此批。

## 11. 邊緣情況與決策

- **時區**：一律存 `timestamptz`，後台以台灣時間（UTC+8）輸入/顯示，比較在 UTC 進行。
- **預設值**：`open_at` 未設 → 教室鎖站、首頁顯示預購、`isPresale=true`。`early_bird_ends_at` 未設 → 一律原價。
- **價格 fallback**：`plan_pricing` 缺方案或缺 `earlyBird` → 用 `original`；整包 settings 取不到 → 用 `PLAN_CATALOG[plan].price`，確保 checkout 永不因設定缺失而壞。
- **優惠券疊加**：套在「當下基準價」（早鳥或原價）之上；既有限量券 CAS 預扣不變。
- **發票金額**（Amego）：用 `orders.amount`（實收），自動跟著新基準價，無需另改。
- **改價時點**：後台改原價/早鳥價只影響「之後」的訂單；既有訂單 `amount` 已落地不受影響。
- **`launch_notified_at` 重置**：不自動重置；本案為一次性上市，無需重寄。手動鈕對已寄送者顯示「已於 X 寄送」並 no-op。
- **middleware 快取失效**：刷新失敗時沿用舊值；冷啟動無值 → 視為鎖站（與「未設開課日」一致）。

## 12. 檔案異動清單

**新增**

- `lib/sale.js`（純 helper + `getSaleSettings`）、`lib/sale.test.js`
- `app/HomeClient.jsx`（由 `page.jsx` 搬出的 client 畫面）
- `app/admin/SaleSettingsPage.jsx`
- `app/api/admin/sale-settings/route.js`
- `app/api/cron/sale-launch-notify/route.js`
- `app/api/admin/send-launch-notify/route.js`（手動鈕轉呼，帶 secret）

**修改**

- `app/page.jsx`（改為 server wrapper）
- `app/admin/page.jsx`（掛新分頁）
- `app/api/payuni/checkout/route.js`（價格來源）
- `app/api/payuni/notify/route.js`（算 presale 傳入信件）
- `lib/brevo-email.js`（presale 改為參數）
- `middleware.js`（鎖站來源 + 快取）
- `supabase-deploy.sql`（建表 + RLS + 預設列）
- `vercel.json`（選配：加每日保底 cron）

## 13. 部署步驟

1. 在 Supabase SQL Editor 執行更新後的 `supabase-deploy.sql`（建 `sale_settings`）。
2. 部署程式碼。
3. 後台「銷售設定」填入開課日、早鳥截止日、各方案價格、覆寫＝依排程，存檔。
4. 確認首頁/教室/信件依設定切換後，移除 Vercel 的 `NEXT_PUBLIC_PRESALE_MODE`。
5. 確認 `CRON_SECRET` 已存在（既有）。

## 14. 測試計畫

- **單元**：`lib/sale.js` 全分支（見 §6）。
- **整合**：checkout 在早鳥前/後回傳正確 `TradeAmt`；優惠券疊加；notify 信件 presale 文案隨開課日切換。
- **端對端（preview）**：以後台設不同 open_at/early_bird，驗證首頁 CTA 四象限、教室鎖站開關、開課通知只寄一次（CAS）。
- 比照記憶：手機 UI 以 Vercel preview + 真機驗證。

## 15. 風險與回滾

- **風險**：middleware 改讀 DB（快取緩解）；首頁由 client→server 拆分需回歸測試互動。
- **回滾**：保留 `NEXT_PUBLIC_PRESALE_MODE` 程式分支至驗證通過後再移除；`sale_settings` 設 `lock_override='locked'` 可立即強制回鎖站狀態。
