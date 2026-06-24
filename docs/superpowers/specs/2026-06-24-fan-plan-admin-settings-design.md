# 後台粉絲限定方案設定 — 設計規格

> 2026-06-24。讓營運者在後台「銷售設定」即時調整粉絲限定方案，免改 code 部署。

## Goal

在後台 `/admin` 的「銷售設定」分頁，讓營運者**即時**調整粉絲限定方案的四項：
1. **啟用/關閉**整個方案
2. **申請截止日**（憑證上傳入口何時關）
3. **粉絲價**（憑證折扣後成交價，現 $3,499）
4. **直購價**（不上傳憑證的直接購買價，現 $3,999）

改完免重新部署（後端即時、前台 ISR ~1 分鐘內反映），對齊既有 bundle 波段價的體驗。

## 背景 / 現狀（參數散落點）

| 參數 | 目前位置 | 影響 |
|------|----------|------|
| 截止日 8/6 | 寫死 `lib/fan-proof.js` `FAN_PROOF_DEADLINE` | `isFanProofOpen()` → 憑證入口顯示 + `/api/fan-proof` gate |
| 粉絲價 3499 | 寫死 `lib/fan-proof.js` `FAN_PRICE` | `buildFanCoupon` 發一次性券的 value |
| 直購價 3999 | DB `coupons` 表手動建的 `FAN3999` price 券 | `HomeClient` 直購 `autoCoupon:"FAN3999"` → checkout 用該券繞過 not_on_sale + 定價 |
| 卡片文案 $3,499/$3,999 | 寫死 `HomeClient.jsx` | 前台顯示 |

後台「銷售設定」(`app/admin/SaleSettingsPage.jsx`) 目前只管 bundle 的 `open_at / list_anchor / list_price / waves / lock_override`，**完全沒有粉絲方案**。

## 架構決策

**擴充 `sale_settings`**（非新表、非環境變數）。理由：與 bundle 波段價同一機制、`getSaleSettings` 已讀整列、後台同一頁、免部署即時生效。環境變數改了要重新部署（違背需求）；新表多一套 API/讀取路徑且與 sale_settings 重複（YAGNI）。

## 資料模型

`sale_settings` 加 `fan_plan JSONB`（idempotent ALTER，default `'{}'`，缺值由 `getFanPlan` fallback）：

```jsonc
{
  "enabled": true,
  "deadline": "2026-08-06T23:59:59+08:00",  // ISO 帶 +08:00
  "proof_price": 3499,                       // 憑證價
  "direct_price": 3999                       // 直購價
}
```

單一值，**不做波段**（粉絲方案本來就非波段定價）。

## 元件與改動（逐檔）

### `lib/fan-proof.js`（純邏輯，改成接受參數）
- `isFanProofOpen(now = new Date(), deadline = FAN_PROOF_DEADLINE)` — deadline 可為 ms number 或可被 `Date.parse` 的字串
- `buildFanCoupon({ code, now = new Date(), price = FAN_PRICE })`
- 保留 `FAN_PRICE` / `FAN_PROOF_DEADLINE` / `FAN_PLAN` 常數當 fallback 預設
- `isOwnProofUrl` 不變

### `lib/sale.js`（正規化 helper）
- 新增 `getFanPlan(settings)` → `{ enabled:boolean, deadlineMs:number, proofPrice:number, directPrice:number }`，任一欄位缺/壞 → fallback 到 `lib/fan-proof` 常數（`enabled` 預設 true）
- `salePhase` 回傳併入 `fanPlan`（給前台）

### `/api/fan-proof/route.js`
- 開頭 `getSaleSettings()` → `getFanPlan()`；`!enabled` → 403 `disabled`；`!isFanProofOpen(now, deadlineMs)` → 403 `closed`
- 發券改 `buildFanCoupon({ code, price: fanPlan.proofPrice })`

### `app/page.jsx`（server component）
- `sale` 物件併入 `phase.fanPlan`（沿用現有 sale 傳遞路徑）

### `app/HomeClient.jsx`
- 粉絲卡：`sale.fanPlan.enabled` 控制**整卡顯示**；`isFanProofOpen(Date.now(), sale.fanPlan.deadlineMs)` 控制憑證入口；價格文案改讀 `proofPrice / directPrice`（不再寫死）
- 直購仍 `autoCoupon:"FAN3999"`（券 value 由後台同步）

### `app/api/admin/sale-settings/route.js`（PATCH 擴充）
- 接受並驗證 `fan_plan`：`enabled` boolean、`deadline` 可 `Date.parse`、`proof_price`/`direct_price` 正整數且 `proof_price ≤ direct_price`
- 寫 `sale_settings.fan_plan`
- **同步 upsert `coupons` 的 `FAN3999` 券**：`{ code:"FAN3999", type:"price", value:direct_price, plan:"bundle", usage_limit:null, status: enabled ? "active" : "disabled" }`（onConflict code）
- GET 回傳含 `fan_plan`（select * 已涵蓋）
- 順序：先寫 settings 成功，再 upsert 券；券失敗回報 error（不靜默）

### `app/admin/SaleSettingsPage.jsx`
- 加「粉絲限定方案」區塊：啟用 checkbox、截止 `datetime-local`、粉絲價 number、直購價 number
- `save()` body 併入 `fan_plan`

### `supabase-deploy.sql`
- `ALTER TABLE sale_settings ADD COLUMN IF NOT EXISTS fan_plan JSONB NOT NULL DEFAULT '{}'::jsonb;`

## 行為邊界

- **`enabled=false`（三層擋）**：① HomeClient 整卡不顯示 ② `/api/fan-proof` 回 403 ③ `FAN3999` 券設 disabled → checkout `couponError` 擋直購
- **截止日過（仍 enabled）**：只關憑證入口（$3,499），直購 $3,999 仍可（與現狀一致）
- **改 `proof_price`**：只影響**之後**新發的一次性 FAN-xxx 券；已發出的舊券 value 已寫入該券、不回溯（= 已給的優惠不變）
- **改 `direct_price`**：同步 `FAN3999` 券 value，影響之後所有直購（共用一張券）

## 測試

- **vitest（純函式）**：`fan-proof`（`isFanProofOpen` 帶不同 deadline 的邊界、`buildFanCoupon` 帶 price）、`sale` 的 `getFanPlan`（完整值 / 缺值 fallback / enabled 預設）
- **build + 端到端手測**：後台 PATCH → 前台價格/截止/開關即時反映、`FAN3999` 券同步、`enabled=false` 三層擋；沿用既有半自動 e2e 腳本模式驗發券 value = proof_price

## 風險 / 備註

- `FAN3999` 券同步是**雙寫**（sale_settings + coupons）：PATCH 內先寫 settings 再 upsert 券，券失敗明確回報，避免「設定改了券沒同步」的不一致。
- 金流暫緩脈絡（[[project-inrecord-payment-pivot]]）：本功能**不動**金流加解密/notify，只擴充營運設定與發券 value，屬設定面，不違反暫緩。
- 既有正式站 `FAN3999` 券若是手動建：首次 PATCH 會以 `onConflict` 接管其 value/status，行為一致（順手確保直購券一定存在）。

## 不做（YAGNI）

波段粉絲價、多檔期、歷史券回溯改價、直購獨立成新 plan。
