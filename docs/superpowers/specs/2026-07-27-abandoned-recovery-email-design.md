# 未成交挽回信（Abandoned Payment Recovery Email）設計

- 日期：2026-07-27
- 站台：InRecord 主站（`~/code/inrecord`）
- 狀態：設計核准 → 實作中
- 所屬：成長功能（Tier 2）；獨立於廣告追蹤，可即刻實作（不卡 Meta 設定）

## 背景與目標

有人走到付款頁（建立了 pending 訂單）卻沒付款 = 高意圖流失。目標：過 N 小時仍未付款，自動寄一封**純提醒**信（不給折扣）促其回來完成，把流失的訂單救回一部分。

**設計原則**：複用既有 pending 訂單與 cron 基礎設施，最小新增。

## 做法（複用 pending 訂單）

`checkout` 建單即為 `status='pending'`；付款成功後 `notify` 轉 `paid`。故「未成交」= 逾時仍 `pending` 的訂單。完全比照既有 `/api/cron/release-coupons` 的 cron 樣式（Bearer `CRON_SECRET`、時間 cutoff、原子 guard 防與 notify 競態）。

```
每小時 cron /api/cron/abandoned-recovery
  找 status='pending' 且 created_at ∈ [now-48h, now-6h] 且 recovery_sent_at IS NULL 且有 email
  對每筆：原子 claim → 成功才寄 Brevo 提醒信 → 寄失敗則還原旗標以便下輪重試
```

## 資料模型

```sql
alter table orders add column if not exists recovery_sent_at timestamptz;  -- 原子去重旗標
```
`orders` 既有 RLS 不變。

## 純函式 `lib/recovery.js`

- `selectRecoveryCandidates(orders, now, { minHours = 6, maxHours = 48 })` → 過濾 `status==='pending'`、`created_at` 落在 `[now-maxHours, now-minHours]`、`recovery_sent_at` 為空、`email` 非空的訂單。**純函式、可測**。
- `buildRecoveryEmail({ planLabel, siteUrl })` → 回 `{ subject, html }`（繁中提醒信；CTA 連結見下）。**純函式、可測**（斷言含 planLabel、CTA 帶 UTM）。

## Cron `/api/cron/abandoned-recovery`

- 認證：`Authorization: Bearer CRON_SECRET`（比照 release-coupons，未帶回 401）。
- 環境：`RECOVERY_AFTER_HOURS`（預設 6）、`RECOVERY_MAX_HOURS`（預設 48）。
- 查候選：`getSupabaseAdmin()` 查 `status='pending'` 且 `created_at < now-AFTER` 且 `created_at > now-MAX` 且 `recovery_sent_at is null`，select `id, email, plan_label, created_at`。
- 逐筆：
  1. **原子 claim**：`update orders set recovery_sent_at=now() where id=? and status='pending' and recovery_sent_at is null` → `.select('id')`；未回傳列＝已被別輪或已 paid，略過（防重寄＋防與 notify 競態）。
  2. claim 成功 → `sendRecoveryEmail(...)`（Brevo）。
  3. **寄失敗** → `update orders set recovery_sent_at=null where id=?`（還原，下輪重試）+ 記 log。
- best-effort：單筆失敗不中斷其他筆；回 `{ ok, scanned, sent, failed }`。
- 加進 `vercel.json` `crons`：`{ "path":"/api/cron/abandoned-recovery", "schedule":"0 * * * *" }`（每小時）。

## 信件（`lib/brevo-email.js` 擴充）

- `sendRecoveryEmail({ email, planLabel })`：用既有 Brevo 寄信基礎（`BREVO_API_KEY`、寄件人設定）。
- 主旨（例）：「你的 InRecord 課程訂單還沒完成 🎹」
- 內文：友善提醒（你在買 `planLabel`）+ **一鍵完成 CTA** + 客服聯絡。繁中、比照現有購買信排版。
- **CTA 連結**：`https://inrecordmusic.com/?utm_source=email&utm_medium=email&utm_campaign=abandoned_recovery#pricing`
  - 指向定價區（原 PayUni 付款連結一次性、已失效 → 回來重新完成）。
  - **帶 UTM** → Phase 1 歸因自動接住 → 後臺「來源歸因表」即見「挽回信帶回幾筆／營收」。**挽回成效追蹤免費**（與 Phase 1 綜效）。
- 信尾附退訂/客服說明。

## 安全 / 隱私 / 邊界

- `recovery_sent_at` 原子 claim → 每單最多一封。
- **只寄 `pending`**：已 `paid`/`expired`/`refunded` 都不寄（claim 的 `status='pending'` 條件保證）。
- 6–48h 視窗：及時、不騷擾陳年放棄單。
- 對象是**已登入且已發起購買**者 → 屬交易性提醒（非冷推銷），風險低；仍附客服/退訂。
- 不落 email 到一般 log（PII）。

## 測試

- **單元**：`selectRecoveryCandidates`（狀態/時間窗邊界/已寄過/無 email 的排除）；`buildRecoveryEmail`（含 planLabel、CTA UTM）。
- **手動（部署後）**：造一筆 pending（created_at 調到 7h 前）→ 打 cron（帶 CRON_SECRET）→ 確認寄一次、`recovery_sent_at` 有值、再打一次不重寄；把該筆改 paid → 不寄。

## 檔案

- 新增：`app/api/cron/abandoned-recovery/route.js`、`lib/recovery.js`、`lib/recovery.test.js`、`supabase-recovery.sql`
- 修改：`vercel.json`（加 cron）、`lib/brevo-email.js`（加 `sendRecoveryEmail`）、`.env` 範例（`RECOVERY_AFTER_HOURS`/`RECOVERY_MAX_HOURS`）、`CLAUDE.md`（cron + SQL runbook）

## 部署

1. `supabase-recovery.sql` 套正式 DB（additive，先於程式碼）。
2. push + `npx vercel --prod`（cron 由 vercel.json 自動註冊）。
3. 安全閘：cron 未帶 CRON_SECRET 回 401；造測試 pending 驗證寄一次 + 不重寄。

## 刻意不做（YAGNI v1）
- 不給折扣（純提醒，已定）。
- 不做多封序列（單封）。
- 不做「開了 BuyModal 但沒送出」的更早期歸因（需新 intent 追蹤）——之後要再擴。
- 不做後臺挽回統計頁（成效已可由「來源歸因表」的 `abandoned_recovery` 來源看到）。
