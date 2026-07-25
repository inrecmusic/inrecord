# 廣告追蹤碼中心 + UTM 歸因（Phase 1）設計

- 日期：2026-07-25
- 站台：InRecord 主站（`~/code/inrecord`，inrecordmusic.com）
- 狀態：設計待審 → 待實作
- 所屬大計畫：**後臺廣告監察儀錶板**（三階段之 Phase 1）

## 背景與目標

使用者要在後臺建立「廣告監察儀錶板」看廣告成效／花費，並強調**最重要是「埋 Pixel」的功能**。經釐清，整個需求其實是兩個獨立系統，且「串 API 撈花費」那半又拆成 Meta / Google 兩個完全不同的整合，範圍過大不宜單一 spec，故分三階段、各自成 spec：

| 階段 | 內容 | 狀態 |
|---|---|---|
| **Phase 1（本 spec）** | 後臺追蹤碼中心（多平台 Pixel 即時開關注入）+ 標準事件 + UTM 寫進訂單 | 設計中 |
| Phase 2 | Meta Marketing API（System User token）每日 cron 撈 insights → 儀錶板，與真實訂單對接算 ROAS | 未開 |
| Phase 3 | Google Ads API（需 developer token 審核）同模式 | 未開；審核有前置期，使用者平行申請中 |

**為何 Phase 1 先做**：Pixel 是「開跑廣告」的前置條件——沒先埋好，Meta/Google 收不到轉換訊號，Phase 2/3 儀錶板也無資料可撈。InRecord 現鎖站至 9/2、廣告多半尚未開跑，正是把追蹤基礎鋪好的時機。順手把 UTM 寫進訂單，Phase 2 才能用真實營收算真 ROAS（平台自估的轉換不準）。

### Phase 1 目標

1. 後臺可自助貼上／開關 Meta Pixel、GA4、Google Ads、LINE Tag 的追蹤碼，即時生效免重新部署。
2. 前台正確注入已開啟平台的追蹤碼，並觸發標準事件：**PageView、ViewContent、InitiateCheckout、Purchase**。
3. 落地時擷取 UTM／click id，last-touch 寫進成交訂單，後臺可依來源看訂單數與營收。

### 明確不做（YAGNI）

- 不做 Cookie 同意橫幅（使用者定案：進站即埋，隱私權政策揭露）。
- 不做 Meta 伺服器端 Conversions API（CAPI）——Phase 2+ 再增準確度。
- 不做 TikTok Pixel——`config` JSONB 已預留，未來加平台免遷移。
- 不做 Lead 事件（使用者未選）。
- 不在 Phase 1 串任何廣告平台 API、不存任何 API token。

## 決策摘要（brainstorming 定案）

- 站台 = InRecord 主站
- 平台 = Meta / GA4+Google Ads / LINE（+ 未來可擴充）
- 管理架構 = **方案 A 自建「追蹤碼中心」**（複用 `sale_settings` 即時改模式），非 GTM、非環境變數
- 同意管理 = 不加橫幅，進站即埋
- 事件集 = PageView + Purchase（必做）+ **InitiateCheckout + ViewContent**
- 歸因模型 = **Last-touch**（direct 不覆蓋既有 UTM）

## A. 資料模型

### A1. 新表 `tracking_settings`（單列 singleton）

複用 `sale_settings` 的「一列設定、後臺即時改」模式。用單一 JSONB `config` 欄承載所有平台，之後加平台免改 schema。

```sql
-- 實作採 id text = 'default' 單列（比照 sale_settings 慣例，非 int/check 版）
create table if not exists tracking_settings (
  id         text primary key default 'default',
  config     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into tracking_settings (id, config) values ('default', '{}'::jsonb)
  on conflict (id) do nothing;
```

`config` 形狀：

```json
{
  "meta":       { "id": "1234567890", "enabled": true },
  "ga4":        { "id": "G-XXXXXXX",  "enabled": true },
  "google_ads": { "id": "AW-XXXXXXX", "purchase_label": "abcDEF123", "enabled": true },
  "line":       { "id": "XXXXXXXX",   "enabled": false }
}
```

- 缺鍵一律視為未設定／未啟用；`getTrackingSettings()` 只回傳 `enabled === true` 且 `id` 非空者。
- RLS/存取：讀取走 server（service role），寫入僅後臺 JWT。Pixel ID 本就在前台 HTML 公開，讀取端無敏感資料。

### A2. `orders` 加欄 `attribution`（JSONB, nullable）

```sql
alter table orders add column if not exists attribution jsonb;
```

形狀（last-touch 快照）：

```json
{
  "utm_source": "facebook", "utm_medium": "cpc",
  "utm_campaign": "summer_launch", "utm_content": "ad_a", "utm_term": "",
  "gclid": "", "fbclid": "IwAR...",
  "landing_path": "/", "referrer": "https://l.facebook.com/",
  "captured_at": "2026-07-25T12:00:00Z"
}
```

未帶任何 UTM／click id 的自然流量訂單，`attribution` 為 `null`（＝direct/organic）。

## B. 前台埋設

### B1. `lib/tracking.js`（server）

- `getTrackingSettings()`：讀 `tracking_settings` 單列，回傳「已啟用」平台的 `{platform: {id, ...}}`。比照 `lib/sale.js` 的 `getSaleSettings()`，用 `getSupabaseAdmin()`，讀取失敗安全回退為「全部關閉」（不讓版面壞掉）。
- 純函式 `enabledPlatforms(config)` 抽出，方便單元測試。

### B2. `app/layout.jsx` 注入

- root layout 為 Server Component，於 `<html>` 內 `await getTrackingSettings()` → 渲染 `<TrackingScripts settings={...} />`。
- `components/tracking/TrackingScripts.jsx`：用 Next.js `next/script`（`strategy="afterInteractive"`），**只**輸出有開啟平台的 base snippet：
  - Meta：base pixel（`fbq('init', id)` + `fbq('track','PageView')`）
  - GA4：`gtag.js` + `gtag('config', 'G-...')`
  - Google Ads：同一份 `gtag.js` + `gtag('config', 'AW-...')`（與 GA4 共用 gtag，只載一次）
  - LINE：LINE Tag base（`_lt('init', ...)` + `send pv`）
- 所有 snippet 於實作時以 Context7 對照 Meta / Google（gtag）/ LINE 官方最新版本核對。

### B3. SPA 換頁補打 PageView

- `components/tracking/RouteChangeTracker.jsx`（client，`usePathname()`）：路徑變化時補打 `fbq('track','PageView')`、GA4 `gtag('event','page_view', {page_path})`、LINE `send pv`。掛在 layout 內。
- 理由：App Router client 端導覽不會重載 base script，單頁應用需手動補頁面瀏覽。

### B4. 事件輔助 `lib/track-event.js`（client）

- 統一封裝 `trackEvent(name, params)`，內部對「目前已載入」的 `fbq / gtag / _lt` 各自轉譯並防呆（未定義就略過）。事件呼叫點只呼叫一次語意事件，不用各自寫三份平台碼。

## C. 事件規格

| 語意事件 | 觸發點 | Meta (`fbq`) | GA4 (`gtag`) | Google Ads | LINE |
|---|---|---|---|---|---|
| PageView | 全站 base + 換頁 | `PageView` | `page_view` | （config 自動） | `send pv` |
| ViewContent | 課程詳情／方案區可視時 | `ViewContent` {content_ids, content_name, value, currency} | `view_item` | — | 選配 |
| InitiateCheckout | 開啟 BuyModal | `InitiateCheckout` {value, currency, content_ids} | `begin_checkout` | — | 選配 |
| **Purchase** | `/success` 成功頁 | `Purchase` {value, currency:'TWD', content_ids, content_type:'product'} | `purchase` {transaction_id, value, currency, items} | `conversion` {send_to:'AW-.../label', value, currency, transaction_id} | 轉換 tag |

### C1. Purchase 取值與防重複

- `/success` 為 `force-dynamic` Server Component，已可取 `searchParams.MerTradeNo`。
- 於 server 端以 `MerTradeNo` 回查 `orders`，取 `amount / plan / order id`（實作時確認訂單商店交易編號對應欄位），將 `{value, currency:'TWD', transactionId, contentIds}` 傳給 client `components/tracking/PurchaseTracking.jsx` 觸發各平台 Purchase／轉換。
- **防重複觸發**：`localStorage` 記 `ir_purchase_fired:<MerTradeNo>`，已存在則不再打（避免使用者重整成功頁重複計轉換）。
- 查無訂單／金額時：不打 Purchase（寧缺勿錯），記 console 便於除錯。

## D. UTM 歸因（Last-touch）

### D1. `lib/attribution.js`（client）

- `captureAttribution()`（於 layout 掛載時、每次落地執行）：讀 URL 的 `utm_source/medium/campaign/content/term`、`gclid`、`fbclid`。
- **Last-touch 規則**：本次落地若帶任一 UTM／click id → 覆寫 first-party cookie `ir_attr`（`SameSite=Lax`、30 天）；若本次為 direct（無任何參數）→ **不覆寫**既有 `ir_attr`（保留上一次有效來源）。
- 首次寫入時一併記 `landing_path`、`document.referrer`、`captured_at`。
- 純解析函式 `parseAttribution(searchParams)` 與 `mergeLastTouch(prev, next)` 抽出可測。

### D2. 帶進訂單

- 結帳流程（BuyModal → `/api/payuni/checkout`）：client 讀 `ir_attr` cookie，放進 checkout POST body 的 `attribution` 欄。
- `app/api/payuni/checkout/route.js`：建立訂單時把 `attribution` 寫入 `orders.attribution`（沿用既有建單路徑，只多寫一欄；缺值寫 `null`）。

### D3. 後臺「來源歸因」報表

- 於既有「銷售分析」分頁新增一區塊：依 `attribution->>utm_source`、`utm_campaign` 分組，顯示**訂單數、營收（淨額）**，`null` 歸為「直接／自然」。
- 純聚合函式放 `lib/attribution-report.js`，可測；資料沿用後臺既有已載入的 orders，不新增 API。
- 此表即 Phase 2 ROAS 的左半邊（右半邊＝廣告 API 花費，之後 join `utm_campaign`）。

## E. 後臺 UI

- `app/admin/page.jsx` 的 `NAV_GROUPS`「設定」群組新增 `{ id:"tracking", label:"追蹤碼", icon: Activity }`（lucide 既有 icon）。
- `app/admin/TrackingSettingsPage.jsx`（比照 `SaleSettingsPage.jsx`）：四張平台卡，每張 = 標題 + 「去哪找這個 ID」小提示 + ID 輸入框 + 啟用開關；底部「儲存」。
- 存檔 API `app/api/admin/tracking-settings/route.js`：`GET` 讀、`PATCH` 寫，JWT 保護（比照 `app/api/admin/sale-settings/route.js`），寫入 `tracking_settings` 單列。
- 儲存後前台即時生效（layout 每次 render 重讀，無需部署）。

## F. 隱私 & 安全

- 隱私權政策（`app/privacy`）補一段：說明使用 Meta Pixel / Google（GA4、Ads）/ LINE Tag 進行成效追蹤與再行銷，並附各平台停用／退出方式連結。
- 寫入端點 JWT 驗證；讀取端點無敏感資料（Pixel ID 前台公開）。
- Phase 1 不引入任何 API secret。

## G. 測試計畫

**單元測試（vitest，比照現有）**
- `lib/tracking.js`：`enabledPlatforms()` 只吐 `enabled && id` 者；缺鍵不炸。
- `lib/attribution.js`：`parseAttribution()` 參數解析；`mergeLastTouch()` direct 不覆蓋、有 UTM 覆蓋。
- `lib/attribution-report.js`：分組聚合、`null` 歸類、營收加總正確。

**人工驗證**
- Meta Pixel Helper / GA4 DebugView / Google Tag Assistant 逐一確認 base 與各事件觸發、參數正確。
- 真跑一筆結帳 → `/success` → 確認 Purchase 帶正確 `value/transaction_id`、重整不重複計。
- UTM：帶 `?utm_source=fb&utm_campaign=test` 落地 → 結帳 → 查該筆 `orders.attribution` 正確。

## H. 檔案清單

**新增**
- `lib/tracking.js`、`lib/track-event.js`、`lib/attribution.js`、`lib/attribution-report.js`
- `components/tracking/TrackingScripts.jsx`、`RouteChangeTracker.jsx`、`PurchaseTracking.jsx`
- `app/admin/TrackingSettingsPage.jsx`
- `app/api/admin/tracking-settings/route.js`
- `supabase-tracking.sql`（建 `tracking_settings` + `orders.attribution` 遷移）
- 對應 `*.test.js`

**修改**
- `app/layout.jsx`（注入 TrackingScripts + RouteChangeTracker + captureAttribution）
- `app/success/page.jsx`（回查訂單 → PurchaseTracking）
- `components/BuyModal.jsx`（InitiateCheckout 事件 + 帶 attribution 進 checkout）
- 課程詳情／方案元件（ViewContent 事件）
- `app/api/payuni/checkout/route.js`（寫 `orders.attribution`）
- `app/admin/page.jsx`（新增「追蹤碼」nav 與分頁掛載；「銷售分析」加來源歸因區塊）
- `app/privacy/...`（追蹤揭露文字）

## I. 為 Phase 2/3 預留的介面

- UTM `utm_campaign` 命名即 join key：Phase 2 撈到的廣告花費將以 campaign 對接 `orders.attribution.utm_campaign` 算 ROAS，故廣告投放時 campaign 命名需與 UTM 一致（實作時於後臺追蹤碼頁加一句提醒）。
- 預期 Phase 2 新表 `ad_insights(date, platform, campaign, spend, impressions, clicks, conversions, ...)` + cron `/api/cron/sync-ad-insights`（複用既有 `vercel.json crons` + `CRON_SECRET`）。本 Phase 不建。

## J. 平行行動（非本 spec 工作，但影響後續）

- 使用者今日起申請 **Google Ads developer token**（Basic access），因審核有前置期、會卡住 Phase 3。
