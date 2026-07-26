# Meta Conversions API（CAPI · 伺服器端 Purchase）設計

- 日期：2026-07-27
- 站台：InRecord 主站（`~/code/inrecord`）
- 狀態：**設計完成；實作刻意延後**（需 Meta Pixel/Dataset + CAPI token，同 Phase 2 前置）
- 所屬大計畫：後臺廣告監察儀錶板 — 廣告追蹤增強（Phase 1 追蹤碼中心已上線；Phase 2 儀錶板設計已寫）

## 背景與價值

純瀏覽器 Meta Pixel 會漏 **10–30% 轉換**（廣告攔截、iOS/Safari ITP、關 cookie）。CAPI 從**伺服器端**（已確認付款的 `notify` webhook）直送 Purchase 給 Meta，補回漏掉的轉換：

- **廣告優化更準**：Meta 收到更完整的轉換訊號 → 自動出價/受眾更有效、獲客成本更低。
- **歸因更完整**：Phase 2 的 ROAS 數字更可信。
- **定位**：Phase 1（瀏覽器 Pixel）給即時訊號、CAPI（伺服器）補漏並提升匹配、Phase 2（儀錶板）衡量成效。三者互補。

**去重**：同一筆購買，瀏覽器 Pixel 與 CAPI 各送一次，靠共用 `event_id` 讓 Meta 只算一次（不會雙計）。

## 前置條件（gating）

實作需要：Meta Pixel/Dataset ID（＝ Phase 1 追蹤碼分頁填的那個）+ **CAPI access token**（System User token 或 Events Manager 產的 dataset token）。這是使用者 Meta 設定的一部分（見 Phase 2 spec Part A）。**spec 現在寫、實作等設定好。**

## 架構 / 資料流

```
結帳 BuyModal ──讀 _fbp/_fbc cookie──▶ /api/payuni/checkout
                                         └─ server 加抓 client IP + User-Agent
                                         └─ 存 orders.capi_data = {fbp, fbc, ip, ua}
付款成功 ──▶ /api/payuni/notify（既有履約原子區塊，fulfilled_at claim 保證一次）
              └─ lib/meta-capi.sendPurchase(order) ──POST──▶ Meta CAPI
瀏覽器 /success：fbq('track','Purchase', params, {eventID: mer_trade_no})
CAPI：event_id = mer_trade_no  ──────────────────────────▶ Meta 依 event_id 去重
```

## 資料模型

新增一欄（不建新表）：

```sql
alter table orders add column if not exists capi_data jsonb;
-- 形狀：{ "fbp": "...", "fbc": "...", "ip": "...", "ua": "..." }
-- fbp/fbc 來自 client（BuyModal 讀 cookie），ip/ua 由 checkout route 於 server 端擷取
```

`orders` 既有 RLS 不變。`capi_data` 含準識別資料，僅 server（service_role）讀寫，不外流前端。

## 元件

### `lib/meta-capi.js`
- `buildPurchaseEvent({ merTradeNo, amount, plan, email, capiData, eventSourceUrl, now })` —— **純函式（可測）**，回 Meta CAPI event 物件：
  - `event_name: "Purchase"`、`event_time: <unix秒>`、`event_id: merTradeNo`、`action_source: "website"`、`event_source_url`
  - `user_data`: `em: [ sha256(email.trim().toLowerCase()) ]`；`fbp`、`fbc`、`client_ip_address`、`client_user_agent`（**這四個原樣、不 hash**；規範只 hash PII）
    - `fbc` fallback：若 `capiData.fbc` 缺但 `orders.attribution.fbclid` 有 → 組 `fb.1.<event_time>.<fbclid>`
  - `custom_data`: `currency: "TWD"`、`value: Number(amount)`、`content_ids: [plan]`、`content_type: "product"`
- `sendPurchase({ pixelId, token, testCode?, event })` —— POST `https://graph.facebook.com/v<版本>/<pixelId>/events`，body `{ data:[event], test_event_code? }`；回 `{ ok, fbtrace_id?, error? }`。
- hash 用 Node `crypto`（SHA256 hex）。⚠️ Graph API 版本會淘汰：實作時以 Context7／Meta 官方文件確認**當前最新穩定版**。

### 結帳擷取（capi_data）
- `components/BuyModal.jsx`：送 checkout 前讀 `document.cookie` 取 `_fbp`、`_fbc`，放進 body（`capiClient: { fbp, fbc }`）。
- `app/api/payuni/checkout/route.js`：取 `req` 的 client IP（比照 `lib/rate-limit.js` 既有 `clientIp(req)`：`x-forwarded-for` 第一個 → `x-real-ip`）與 `user-agent` header；與 body 的 `fbp/fbc` 合成 `capi_data` 寫入該筆訂單。缺值寫 null，不擋結帳。

### notify 送出
- `app/api/payuni/notify/route.js`：在**既有履約原子區塊**（已用 `fulfilled_at` CAS claim 保證每單只履約一次）內、開通/寄信旁，呼叫 `lib/meta-capi.sendPurchase(...)`。
  - 讀 pixelId 自 `getTrackingSettings()`（`config.meta`）；token 自 `META_CAPI_ACCESS_TOKEN`。**meta 未啟用或 token 未設 → 略過**（不報錯）。
  - `email/amount/plan/mer_trade_no` 均已在 notify select 範圍（另需把 `capi_data`、`attribution` 加進該 select）。

### Phase 1 微調（去重關鍵）
- `components/tracking/PurchaseTracking.jsx` + `lib/track-event.js`：讓瀏覽器 Purchase 帶 `eventID`。
  - `trackEvent("Purchase", params, { eventId })` → 內部 `fbq('track','Purchase', metaParams, { eventID: eventId })`。
  - `eventId = transactionId`（= mer_trade_no），與 CAPI `event_id` 一致 → Meta 去重。
  - 此為既有 Phase 1 事件分派的小幅擴充，需補對應單元測試（eventID 有帶到 fbq 第 4 引數）。

## 設定 / 機密
- `META_CAPI_ACCESS_TOKEN`（env，機密）
- `META_CAPI_TEST_CODE`（env，選配；Events Manager「測試事件」驗證期間用，驗完清除）
- Pixel ID **不另設 env**，讀 `tracking_settings.config.meta.id`（與 Phase 1 同一 pixel、單一事實來源）

## 安全 / 韌性
- CAPI 送出 **best-effort**：整段 try/catch，失敗記 log + `lib/admin-alert.js` 告警給 `ADMIN_EMAIL`，**絕不影響 notify 的付款確認/開通/寄信/開票**（金流最優先，notify 一律回 200）。
- email 送出前 SHA256；IP/UA/fbp/fbc 僅 server 端處理、**不落一般 log**（避免 PII 外洩）。
- notify 可能被 PayUni 重送 → 靠既有 `fulfilled_at` 原子 claim 讓 CAPI 只送一次；即便偶發重送，Meta 也以 `event_id` 去重，雙保險。

## 測試
- **單元**：`buildPurchaseEvent`（email 正規化+hash、user_data/custom_data 形狀、fbc fallback 自 fbclid、缺 fbp/fbc/ip/ua 時省略欄位）；`track-event` 帶 `eventID`。API POST 用 mock，不真打。
- **手動（Meta 設定好後）**：Events Manager →「測試事件」拿 `test_event_code` → 走一筆真結帳 → 確認 server Purchase 到達、且與瀏覽器 Purchase **去重（Events Manager 顯示 Deduplicated）**、匹配品質分數。

## 檔案清單（實作時）
- 新增：`lib/meta-capi.js`(+test)、`supabase-capi.sql`（`orders.capi_data` 欄）
- 修改：`components/BuyModal.jsx`（讀 _fbp/_fbc → body）、`app/api/payuni/checkout/route.js`（存 capi_data）、`app/api/payuni/notify/route.js`（履約區塊送 CAPI + select 加 capi_data/attribution）、`components/tracking/PurchaseTracking.jsx` + `lib/track-event.js`(+test)（帶 eventID）、`.env` 範例 + `CLAUDE.md`（META_CAPI_* 說明）

## 使用者 Meta 設定（CAPI token）
在 Phase 2 的 Meta 設定基礎上，多一步拿 CAPI token：
- 事件管理員 → 你的 Dataset(Pixel) → 設定 → Conversions API →「產生存取權杖」；或用 Phase 2 的 System User token（需該 System User 有此 Dataset 權限）。
- 驗證期在同頁「測試事件」取 `test_event_code`。

## 開放決策
- API 版本：實作時鎖當前最新穩定版。
- `event_source_url`：用 `/success` URL 或站台首頁（預設 `https://inrecordmusic.com/success`）。
- 是否也對「現場/手動開通」單（`source='manual'`/concert）送 CAPI —— 預設**只對線上金流單**送（那才是廣告可歸因的購買）；現場單非廣告轉換，不送。

## 與其他階段關係
- 依賴 **Phase 1**（Pixel + /success Purchase + attribution.fbclid）。
- 提升 **Phase 2** 的 ROAS 可信度（Meta 回報轉換更完整）。
- **Phase 3**（Google Ads）另有 Enhanced Conversions（類似伺服器端補傳），本 spec 不含。
- Phase 1 spec：`2026-07-25-ad-tracking-pixel-phase1-design.md`；Phase 2 spec：`2026-07-26-ad-tracking-phase2-meta-insights-design.md`。
