# 後台營運助理（每週報告，唯讀）— 設計

日期：2026-09-09　狀態：待使用者審閱

## 目標

每週一早上 8 點自動產生一份「上週營運週報」：數字由程式算好，交給 Claude 解讀成一句總結、重點、風險與建議（附後台連結）。報告存進資料庫、後台新頁可看、同時寄摘要信給管理員。**完全唯讀**：模型沒有任何可寫入的工具，建議只是文字，動作仍由人在後台執行。

使用者定案：做進 InRecord 後台；每週一次；第一版不做一鍵核准。

## 架構

```
Vercel Cron（每週一 00:00 UTC＝台灣 08:00）
  → GET /api/cron/ops-report（Bearer CRON_SECRET）
      → lib/ops-report/collect.js  用 service role 讀 DB＋既有 helper，算出「資料包」(純 JSON)
      → lib/ops-report/generate.js  @anthropic-ai/sdk  messages.parse（結構化輸出）→ 報告 JSON
      → 寫入 ops_reports；寄摘要信（sendNewsletterEmail, kind="ops_report"）
後台「營運助理」頁 ← GET /api/admin/ops-report（列表／單份）；POST /api/admin/ops-report/run（立刻產生）
```

Fail-safe：未設 `ANTHROPIC_API_KEY` → cron 回 `{ skipped: "no_api_key" }`、後台按鈕顯示未設定；不影響任何既有功能。

## 資料包（collect.js，純函式＋讀取層分離）

期間：上週一 00:00 至本週一 00:00（台灣時間），並附前一週同欄位供比較。全部由程式計算，模型不得自行加總。

| 區塊 | 內容 | 來源／重用 |
|---|---|---|
| 訂單 | 新單數、已付款數與淨營收（`summarizeOrders`）、退款數與金額、來源分布（payuni／concert／manual）、卡在 pending 超過 72 小時的單數 | orders |
| 待處理 | 已付款但未開通名單（`pickUngrantedPayuni`，含 email、付款時間）；寄信失敗紀錄（email_log status≠sent） | orders＋enrollments、email_log |
| 學員 | 本週有觀看紀錄人數、累計觀看分鐘、完成單元中位數、零觀看的已購學員數 | progress、enrollments |
| 電子報／名單 | 本週寄出封數、Brevo 額度（`quotaSummary`）、退訂數；LEAD_CAPTURE 開啟時附潛客清單人數 | email_log、newsletter_unsubscribes、Brevo API |
| 廣告 | 有設 Meta env 時：花費、曝光、點擊、真實 ROAS（重用廣告成效頁的報表函式）；未設則標示未接 | ad_insights |
| 優惠券 | 啟用中券數；異常提示：券價低於當前波段價、名稱像測試用（SMOKE／TEST）、無上限指定價券 | coupons、sale_settings |
| 內容進度 | 已發布但無影片的單元數與最舊預計日；未發布公告草稿數 | videos、announcements |
| 近期時程 | 14 天內的波段換價日、粉絲截止日、9/30、10/31 里程碑 | sale_settings、常數 |

隱私：Email 只出現在「待處理」名單（後台本來就看得到）；報告只存後台與管理員信箱。

## 模型與提示（generate.js）

- 模型 `claude-opus-5`，`thinking: { type: "adaptive" }`，`output_config: { effort: "medium" }`，`max_tokens: 8000`。
- 結構化輸出（`output_config.format` JSON schema，`messages.parse`）：
  ```
  { headline: string,                          // 一句話總結
    highlights: string[3..5],                  // 重點，每條引用資料包數字
    risks: [{ level: "high"|"medium"|"low", text }],
    suggestions: [{ title, why, admin_path }], // admin_path 只能是白名單內的後台頁面 hash
    metrics: { ...資料包關鍵數字原樣回填 } }
  ```
- System prompt（固定、加 `cache_control`）：角色＝InRecord 營運顧問；只可引用資料包中的數字；不得臆測沒有的資料；繁體中文台灣口語；建議要可執行、附對應後台頁面；不得建議任何自動執行。
- User turn＝資料包 JSON（本週＋上週）。單次呼叫、不使用工具。
- 成本：約 30K 輸入＋3K 輸出 ≈ 0.25 美元／次；每月約 1 美元。usage 記進報告列。

## 資料表

```sql
CREATE TABLE IF NOT EXISTS ops_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start TIMESTAMPTZ NOT NULL,
  period_end   TIMESTAMPTZ NOT NULL,
  triggered_by TEXT NOT NULL DEFAULT 'cron',      -- 'cron' | 'manual'
  report       JSONB NOT NULL,                     -- 模型輸出
  pack         JSONB NOT NULL,                     -- 資料包（可回溯核對）
  model        TEXT, input_tokens INTEGER, output_tokens INTEGER, cost_usd NUMERIC(8,4),
  emailed_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE ops_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_ops_reports" ON ops_reports USING (auth.role() = 'service_role');
```
新檔 `supabase-ops-reports.sql`，idempotent；列入 CLAUDE.md 部署 SQL 順序。

## API

- `GET /api/cron/ops-report`：Bearer `CRON_SECRET`；同一期間已有 cron 報告 → 回既有（冪等）；產生後寄信。
- `GET /api/admin/ops-report?limit=12`、`GET /api/admin/ops-report?id=`：後台 token。
- `POST /api/admin/ops-report/run`：後台 token；期間＝過去 7 天到現在；`triggered_by='manual'`；不寄信（畫面直接顯示）；限流每 10 分鐘 1 次。

## 後台頁「營運助理」

- 左：報告列表（期間、觸發方式、成本）；右：所選報告——總結、重點、風險（高／中／低色標）、建議（連結到後台對應頁）、關鍵數字表（本週 vs 上週）、頁尾顯示模型與 token。
- 頂部「立刻產生」按鈕；未設 API key 時顯示說明文字並停用。
- 沒有任何寫入動作按鈕。

## 摘要信

- 主旨「InRecord 營運週報 M/D–M/D」；內文 Markdown（總結、重點、風險、建議＋連結、數字表）→ `renderAdminEmailHtml`；收件人 `ADMIN_EMAIL`；`kind="ops_report"` 進 email_log。

## 測試

- collect：各區塊聚合純函式用 fixture 驗數字（含期間邊界、時區）；異常券判定；空資料不炸。
- prompt/schema：資料包序列化順序穩定（快取）；schema 通過；`admin_path` 白名單驗證函式。
- generate：mock SDK，確認 model／effort／format 參數與回傳解析；API 錯誤（429／5xx）回可辨識錯誤不寫壞資料。
- cron route：無 CRON_SECRET／錯 token → 401；無 API key → skipped；同期間重跑回既有。
- admin route：401 守衛；manual 限流。
- 頁面 smoke：有報告時渲染各區塊；無報告與未設 key 的空狀態。

## 上線步驤

1. 正式 DB 跑 `supabase-ops-reports.sql`。
2. Vercel 設 `ANTHROPIC_API_KEY`（Production＋Preview）。
3. preview 部署 → 後台「立刻產生」跑一次真報告（preview 與正式共用 DB，該筆報告會留著）→ 使用者看內容與版面。
4. `vercel.json` 加排程 → `vercel --prod`。

## 不在範圍（之後）

一鍵核准動作、每日頻率、Slack／LINE 推播、對消費者的客服 agent。
