# 廣告成效儀錶板（Phase 2 · Meta Marketing API）設計 + 設定準備指南

- 日期：2026-07-26
- 站台：InRecord 主站（`~/code/inrecord`）
- 狀態：**設計完成、設定指南就緒；實作刻意延後**（見「前置條件」）
- 所屬大計畫：後臺廣告監察儀錶板 — Phase 2（Phase 1 追蹤碼中心已上線正式站）

## 背景與前置現實

Phase 2 = 把 Meta 廣告的**花費／完整漏斗指標**撈進後臺，並與 Phase 1 寫入訂單的 UTM 歸因對接，算出**以真實營收為基準的 ROAS**。

但使用者目前**尚未投過 Meta 廣告、也還沒有 Business Manager／廣告帳戶**。因此：

- 現在沒有任何廣告數據可撈，帳戶／token／campaign 都還不存在。
- **實作 Phase 2 的正確時機是：使用者已建好帳戶＋token、且廣告已跑幾天累積數據之後。** 現在就做會是空儀錶板、且細節得用猜的（違反 YAGNI）。

故本文件產出兩件事：**(A) 使用者要在 Meta 完成的設定步驟**、**(B) Phase 2 的技術設計**，等數據到位再照 B 實作。

**Phase 1 ↔ Phase 2 的接點**：Phase 1 已在 `orders.attribution` 存 last-touch UTM。Phase 2 的 ROAS 靠 `utm_campaign` 把「Meta 花費」對上「你的真實訂單營收」。所以**投放時的 campaign 命名／URL 參數必須與 UTM 對齊**（見 Part C）。

---

## Part A — 你要在 Meta 完成的設定（逐步）

> 全部免費。做完把「Ad Account ID」與「System User token」交給我（token 是機密，用密碼管理器或當面給，勿貼在公開處）。

1. **建立 Business Manager（企業管理平台）**
   - 到 business.facebook.com → 建立企業檔案（填公司名 InRecord、你的名字、公司 Email）。

2. **建立廣告帳戶**
   - 企業設定 → 帳戶 → 廣告帳戶 → 新增 → 建立新的廣告帳戶（設定時區＝台北、幣別＝TWD，**之後不可改**，要設對）。
   - 記下 **廣告帳戶 ID**（`act_` 後面那串數字，例如 `act_1234567890`）。

3. **建立 Meta Pixel（並接回 Phase 1）**
   - 事件管理員 → 連接資料來源 → 網站 → 建立 Pixel（Dataset）。
   - 這個 **Pixel ID** 就是你要**填回 InRecord 後臺→設定→追蹤碼→Meta Pixel** 的值（Phase 1 埋設就靠它；兩階段在此接起來）。

4. **建立 Meta App（產 token 用）**
   - developers.facebook.com → 我的應用程式 → 建立應用程式 → 類型選 **Business/商業** → 綁定上面的 Business Manager。
   - （不需要送 App Review；只是產 System User token 的載體。）

5. **建立 System User 並產長效 token**
   - 企業設定 → 使用者 → 系統使用者 → 新增（角色 Employee 即可）。
   - 指派資產：把上面的**廣告帳戶**加給這個 System User，權限勾 **查看成效／`ads_read`（Analyst）**。
   - 產生權杖：選該 System User → 產生新權杖 → 選第 4 步的 App → 勾 **`ads_read`** → 產生。
   - **System User token 預設長效、不會 60 天過期**（這正是免麻煩的關鍵；一般會員 token 會過期）。妥善保存。

6. **投放時對齊 UTM**（見 Part C 的命名慣例）——這步在你開始投廣告時做。

7. **交付給實作**：`廣告帳戶 ID (act_…)`、`System User token`。

---

## Part B — 技術設計（數據到位後照此實作）

### B1. 機密（環境變數，server-only）
- `META_ADS_ACCESS_TOKEN` — System User 長效 token
- `META_AD_ACCOUNT_ID` — `act_…`
- （複用既有 `CRON_SECRET` 保護排程）

### B2. 新表 `ad_insights`
每日每 campaign 一列；PK 讓同步可 idempotent upsert。**RLS service_role-only**（記取 Phase 1 教訓：新公開表若無 RLS，anon 可直接讀寫）。

```sql
create table if not exists ad_insights (
  platform      text not null default 'meta',
  campaign_id   text not null,
  campaign_name text,
  date          date not null,
  spend         numeric not null default 0,
  impressions   bigint  not null default 0,
  clicks        bigint  not null default 0,
  ctr           numeric,
  cpc           numeric,
  cpm           numeric,
  meta_conversions       numeric not null default 0,  -- Meta 自報的購買轉換數
  meta_conversion_value  numeric not null default 0,  -- Meta 自報的轉換金額
  currency      text default 'TWD',
  updated_at    timestamptz not null default now(),
  primary key (platform, campaign_id, date)
);
alter table ad_insights enable row level security;
create policy "service_role_ad_insights" on ad_insights
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
```

### B3. `lib/meta-ads.js`（API 取數）
- `fetchInsights({ accountId, token, since, until })`：
  - 打 `GET https://graph.facebook.com/v<版本>/act_<id>/insights`
  - 參數：`level=campaign`、`time_increment=1`（每日）、`time_range={since,until}`、
    `fields=campaign_id,campaign_name,spend,impressions,clicks,ctr,cpc,cpm,actions,action_values`
  - 處理**分頁**（`paging.next` 迴圈）、**錯誤**（token 失效、rate limit）→ 拋出可辨識錯誤。
  - `actions`/`action_values` 是 `[{action_type,value}]` 陣列 → 抽出購買 action（如 `offsite_conversion.fb_pixel_purchase` / `purchase`）得 `meta_conversions` / `meta_conversion_value`。
- 純轉換邏輯 `normalizeInsightRow(raw)` 抽出成純函式（可單元測試，不需真打 API）。
- ⚠️ Graph API 版本會定期淘汰：實作時以 Context7／Meta 官方文件確認**當前最新穩定版**再寫死。

### B4. Cron `/api/cron/sync-ad-insights`
- `Authorization: Bearer CRON_SECRET`（比照現有 cron）。
- 撈**近 7 天滾動視窗**（`since = 今天-7`）→ `fetchInsights` → 對每列 `upsert ad_insights`（onConflict = 主鍵）。用滾動視窗補抓「廣告數據事後回補」。
- 失敗（token 失效等）→ 記 log + 沿用 `lib/admin-alert.js` 寄告警給 `ADMIN_EMAIL`；回 200 不讓排程器重試轟炸。
- 加進 `vercel.json` `crons`（例：每日一次）。

### B5. `lib/ad-report.js`（ROAS join，純函式可測）
- 輸入：`ad_insights` 列（花費/漏斗指標）、已付款 `orders`（含 `attribution.utm_campaign`、`amount`）、日期範圍。
- 依 campaign 聚合：
  - 廣告側：spend、impressions、clicks、CTR、CPC、CPM、meta_conversions、meta_conversion_value
  - 你的真實側：orders 數、真實營收（`sum(amount)`，退款排除）
  - **真 ROAS = 真實營收 ÷ spend**（spend=0 顯示「—」）
- 回每 campaign 一列 + 總計列；另可算每日趨勢（spend vs 真實營收）。

### B6. 後臺新分頁「廣告成效」（AdsPerformancePage）
- 掛在 admin `NAV_GROUPS`（「學員服務」或「設定」擇一），比照 Phase 1 分頁模式。
- **頂部 KPI**：總花費、真實營收、**真 ROAS**、曝光、點擊、CTR、CPC、CPM。
- **每 campaign 明細表**：campaign | 花費 | 曝光 | 點擊 | CTR | CPC | Meta回報轉換 | 你的訂單 | 你的營收 | **真 ROAS**。
- **每日趨勢圖**：花費 vs 真實營收（複用 `lib/dashboard.js` 圖表輔助風格）。
- **日期範圍**：7 / 30 / 90 天 / 自訂（複用既有 `lib/date-range.js`）。
- 資料來源：新 API `/api/admin/ad-insights`（JWT 保護，讀 `ad_insights` + 該範圍 orders，回 `ad-report` 聚合結果）。

### B7. 錯誤處理 & 測試
- token 失效/API 錯 → 後臺告警 + 儀錶板顯示「資料同步異常，最後成功時間 …」而非崩潰。
- 單元測試：`normalizeInsightRow`（actions 抽取、缺值）、`lib/ad-report.js`（join、ROAS、退款排除、spend=0）。API 取數用 mock，不真打。

---

## Part C — ROAS 的靈魂：campaign 命名 / UTM 對齊

ROAS join 的鍵是 `orders.attribution.utm_campaign`（Phase 1 從落地 URL 擷取）對上 `ad_insights` 的 campaign。投放時務必讓兩者對得起來。

**做法（推薦）**：在 Meta 廣告的「網址參數（URL Parameters）」欄填：
```
utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}
```
- `{{campaign.name}}` 由 Meta 自動代入 campaign 名 → 落地 URL 帶 `utm_campaign=<campaign名>` → Phase 1 寫入訂單 → join `ad_insights.campaign_name`（兩側正規化：trim/小寫比對）。
- 好處：Phase 1 的「來源歸因表」顯示的就是可讀的 campaign 名。

**更穩健的替代**：改用 `utm_campaign={{campaign.id}}`（數字 ID）→ join `ad_insights.campaign_id`，不怕改名／編碼問題；代價是 Phase 1 來源表顯示為數字。**決策留待帳戶存在時定**（預設走 `{{campaign.name}}` + 正規化比對）。

---

## Part D — 前置條件 / 何時實作

實作 Phase 2 的啟動條件（全部成立才開工）：
1. Business Manager + 廣告帳戶已建、拿到 `act_…` 與 System User token。
2. Meta Pixel 已填回 Phase 1 並啟用（轉換有在追）。
3. 廣告已投、**跑了幾天有花費/成效數據**、且**至少有幾筆帶 UTM 的成交訂單**（否則 ROAS 無從算起、儀錶板是空的）。

達成後，這份文件轉為實作 spec，走 writing-plans → 逐 task 實作（比照 Phase 1）。

## 檔案清單（實作時）
- 新增：`lib/meta-ads.js`(+test)、`lib/ad-report.js`(+test)、`app/api/cron/sync-ad-insights/route.js`、`app/api/admin/ad-insights/route.js`、`app/admin/AdsPerformancePage.jsx`、`supabase-ad-insights.sql`
- 修改：`vercel.json`（加 cron）、`app/admin/page.jsx`（加「廣告成效」nav + 掛載）、`.env` 範例（加 META_* 說明）、`CLAUDE.md`（部署 SQL runbook + env 說明）

## 開放決策（帳戶存在後確認）
- campaign join 鍵：`{{campaign.name}}`（預設，可讀）vs `{{campaign.id}}`（穩健）。
- 同步頻率：每日一次（預設）是否夠，或要每 6/12 小時。
- 歸因視窗：真 ROAS 用你的訂單（乾淨）；是否也要並列 Meta 的 7-day-click/1-day-view 口徑供比對。
- 幣別：假設全 TWD；若廣告帳戶用他幣需換算。

## Phase 3（Google Ads）備註
同模式（cron 撈 insights → 表 → 儀錶板 join），但 auth 不同：需 **Google Ads API developer token（要申請審核、有前置期）** + OAuth refresh token + GAQL。建議 Phase 2 上線後再啟動；developer token 申請可提早進行。相關：Phase 1 spec `2026-07-25-ad-tracking-pixel-phase1-design.md`。
