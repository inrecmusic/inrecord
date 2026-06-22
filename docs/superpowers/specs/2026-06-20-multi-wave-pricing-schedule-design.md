# 多波段價格排程（Sub-1）— 設計文件

> 日期：2026-06-20　狀態：設計定案，待寫實作計畫
> 前置：建立在已上線的「銷售期間自動切換 CTA」之上（`sale_settings` / `lib/sale.js` / 首頁 server 化 / checkout `currentPrice` / coupon-validate / middleware 鎖站 / 開課信 / 開課通知）。

## 1. 背景與目標

現有功能只支援「單一早鳥價＋單一截止日 → 回原價」。實際上市活動是**多波段遞增定價**：三段早鳥（價格逐波調漲）＋ 正式牌價，首頁／結帳需依當下日期自動取對應波段價，免人工。

本案把 `sale_settings` 的定價模型從「單一早鳥」換成「**正式牌價 ＋ 一串期間限定波段**」，並讓首頁新增「即將開賣（第一波之前）」狀態。

**教室鎖站、開課信、開課通知維持現況**（仍由 `open_at` 驅動），本案只動「價格」與「開賣前狀態」。

## 2. 範圍

**包含**
1. `sale_settings` 定價模型改版（`list_price` ＋ `waves[]`，移除舊單一早鳥欄位）。
2. `lib/sale.js` 取價狀態機（pre_launch / wave / list）。
3. checkout 新增「開賣前不可購買」防呆（`not_on_sale`）。
4. 首頁三態（即將開賣＋倒數＋留信箱／早鳥預售中＋漲價倒數／正式牌價）。
5. 後台波段編輯器（牌價＋可增刪波段）＋ API 驗證。

**不包含（Sub-2，下一輪）**
- 🎪 現場 $2,500 序號卡、🎯 粉絲 $3,499 線上驗證。需新增「指定價」券型＋身分驗證，於結帳時以序號價覆蓋波段價。

## 3. 已確認決策

| 項目 | 決定 |
|------|------|
| 資料模型 | 方案 1：`list_price`（牌價＝錨點＋波段後常態價）＋ `waves[]`（期間限定促銷） |
| 教室開放 | 沿用現況：`open_at` 鎖站→解鎖＋開課信／開課通知（不動） |
| 開課日 | 暫定 9/4（後台可改） |
| 第一波之前 | **即將開賣**：不開放購買、顯示倒數到開賣＋留信箱通知 |
| 刪除線錨點 | 正式牌價（course 6,800／bundle 5,800） |
| 波段名稱 | **不**顯示（保留通用「早鳥」感即可） |
| 催單 | 顯示「下一波漲價日／漲價倒數」 |
| 邊界語意 | `starts_at` 含、`ends_at` 不含，台灣時間；波段連續＝前段 `ends_at`＝後段 `starts_at` |

## 4. 資料模型（`sale_settings` 改版）

```
保留：open_at、lock_override、launch_notified_at、updated_at、id
新增：
  list_price  JSONB NOT NULL DEFAULT '{}'   -- { "course":6800, "bundle":5800 }
  waves       JSONB NOT NULL DEFAULT '[]'    -- 有序陣列，元素：
              -- { "starts_at": ISO8601, "ends_at": ISO8601, "prices": { "course":Int, "bundle":Int } }
移除：plan_pricing、early_bird_ends_at
```

### 遷移（表已上線，需 ALTER；同步更新 CREATE 區塊給新環境）

```sql
ALTER TABLE sale_settings ADD COLUMN IF NOT EXISTS list_price JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE sale_settings ADD COLUMN IF NOT EXISTS waves      JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE sale_settings DROP COLUMN IF EXISTS plan_pricing;
ALTER TABLE sale_settings DROP COLUMN IF EXISTS early_bird_ends_at;
```

並把 `supabase-deploy.sql` 的 `sale_settings` CREATE 區塊改成新欄位（移除 `plan_pricing`/`early_bird_ends_at`、加入 `list_price`/`waves`）。全程 idempotent。

> **遷移期安全**：ALTER 後若尚未設定（`list_price={}`、`waves=[]`），狀態機回 `list` 態、價格 fallback `PLAN_CATALOG`（3800/3999）、`onSale=true`、教室仍鎖（`open_at` 仍為 NULL）——與目前線上行為一致，不會壞。設定波段（第一波在未來）後才進入「即將開賣」。

## 5. 取價狀態機（`lib/sale.js`，純函式可測）

```js
// settings 形狀：{ open_at, lock_override, launch_notified_at, list_price:{[plan]:Int}, waves:[{starts_at,ends_at,prices:{[plan]:Int}}] } | null

activeWave(settings, now)   // waves 中 now∈[starts_at, ends_at) 的第一個；無則 null
listPrice(plan, settings)   // settings.list_price[plan] ?? PLAN_CATALOG[plan].price

currentPrice(plan, settings, now)
  // active = activeWave(...); 命中 → Math.min(active.prices[plan], listPrice)（防呆：波段價不超過牌價）
  // 否則 → listPrice(plan, settings)

salePhase(settings, now) → {
  state,           // 'pre_launch'（now < 第一波 starts_at）| 'wave'（命中波段）| 'list'（其餘，含波段後/無波段/波段間隙）
  classroomOpen,   // = isClassroomOpen(settings, now)（不變）
  onSale,          // = state !== 'pre_launch'
  salesStartAt,    // 第一波 starts_at（ISO）| null —— 即將開賣倒數用
  nextIncreaseAt,  // 命中波段的 ends_at（ISO）| null —— 漲價倒數用
  plans: { [plan]: { price, listPrice, isEarlyBird } }  // isEarlyBird = state==='wave' && price < listPrice
}

isOnSale(settings, now)        // = salePhase(...).state !== 'pre_launch'
isClassroomOpen / isPresale    // 不變（open_at / lock_override）
```

**狀態判定**（順序）：① 命中某波段 → `wave`；② 有波段且 `now < waves[0].starts_at`（依 `starts_at` 排序後第一波）→ `pre_launch`；③ 其餘 → `list`（**無波段**、晚於最後一波、或波段間隙皆歸此，安全回退牌價）。故 `waves=[]` 永不為 `pre_launch`。

## 6. 後端

- **`app/api/payuni/checkout`**：基準價已走 `currentPrice`（不動）；**新增**在方案/email 驗證後加 `if (!isOnSale(settings, now)) return 400 not_on_sale;`，擋第一波開賣前的購買。
- **`app/api/coupons/validate`**：已走 `currentPrice`（不動）。
- **`middleware.js`／`lib/brevo-email.js`／開課通知**：完全不動（仍靠 `open_at`/`isClassroomOpen`/`isPresale`）。

## 7. 首頁三態（`app/page.jsx` server ＋ `app/HomeClient.jsx`）

`page.jsx` 用 `salePhase` 算出 `sale`（含 `state`、`onSale`、`salesStartAt`、`nextIncreaseAt`、各方案 `price/listPrice/isEarlyBird`），傳給 `HomeClient`。

| 狀態 | 方案卡 | 購買鈕（nav/hero/cta/sticky） | 教室 |
|------|--------|------|------|
| **pre_launch** | 不顯示售價；標「即將開賣・開賣倒數」 | 「即將開賣」停用 ＋ **留信箱通知**（`/api/brevo/subscribe`） | 鎖 |
| **wave** | `~~listPrice~~ price／永久` ＋ 通用「早鳥」標 ＋ 「X/X 漲價」倒數（`nextIncreaseAt`） | 「立即預購」 | 鎖 |
| **list** | `price`（無刪除線） | 「立即購買」 | 開（`open_at`） |

- 「即將開賣」倒數以 `salesStartAt`、漲價倒數以 `nextIncreaseAt` 計算（client 端即時倒數，server 提供 ISO）。
- 留信箱：pre_launch 狀態在購買鈕處放 email 輸入＋「開賣通知我」，POST 既有 `/api/brevo/subscribe`（實作時確認其 request 形狀／名單）。
- 新中文字套 `word-break:keep-all; line-break:strict`。
- ISR `revalidate=60` 不變；client 端倒數使跨分鐘的顯示仍即時。

## 8. 後台波段編輯器（`app/admin/SaleSettingsPage.jsx`）

- **正式牌價**：course／bundle 數字（→ `list_price`）。
- **波段清單**：可增刪的列，每列＝起始、結束（`datetime-local` 台灣）、course 價、bundle 價（→ `waves[]`，依起始排序後送出）。
- 保留：開課日（`open_at`）、手動覆寫（`lock_override`）、`launch_notified_at` 顯示＋「立即寄送開課通知」。
- 即時預覽：依當下時間顯示目前狀態（即將開賣／第幾段價／牌價）與現價。
- **`/api/admin/sale-settings` PATCH 驗證**：`list_price` 各價為非負整數；`waves` 為陣列，每元素含可解析的 `starts_at`/`ends_at` 與 `prices.course`/`prices.bundle` 非負整數；其一不符回 400（明確錯誤碼）。`GET` 回讀同結構。

## 9. 測試（`lib/sale.test.js`）

純函式全分支：
- `activeWave`／`currentPrice`：pre_launch（早於第一波）、命中各波、波段後（list）、波段間隙（回 list）、無 waves（fallback）、波段價 > 牌價時 `Math.min` 防呆。
- 邊界：`starts_at` 含（`now==starts_at`→該波）、`ends_at` 不含（`now==ends_at`→下一波/list）。
- `salePhase`：三態、`onSale`、`salesStartAt`、`nextIncreaseAt`、`isEarlyBird`。
- `isOnSale`。

## 10. 上線設定值（後台輸入，非寫死；記於此供填寫）

```
list_price : course 6800, bundle 5800
waves[0]   : 2026-07-08 00:00 – 2026-07-20 00:00   course 5500, bundle 4299
waves[1]   : 2026-07-20 00:00 – 2026-08-06 00:00   course 5800, bundle 4799
waves[2]   : 2026-08-06 00:00 – 2026-09-04 00:00   course 6200, bundle 5299
open_at    : 2026-09-04 00:00（暫定）
（皆台灣時間 UTC+8）
```

## 11. 邊緣情況與決策

- **時區**：存 `timestamptz`，後台台灣時間輸入，比較 UTC。
- **波段價防呆**：`Math.min(波段價, 牌價)`——避免設錯成高於牌價而超收。
- **波段間隙**：落在兩波之間（表格無此情況）→ 回 `list`（牌價），安全。
- **未設定（遷移後空白）**：`list` 態、`PLAN_CATALOG` fallback、`onSale=true`、教室鎖——與現狀一致。
- **開賣前防呆**：checkout `not_on_sale` 為權威閘；前端買鈕停用為 UX。
- **優惠券疊加**：仍套在 `currentPrice`（當下波段價）之上（不變）。Sub-2 的「指定價序號」之後再覆蓋。

## 12. 檔案異動清單

**修改**
- `supabase-deploy.sql`（CREATE 區塊改新欄位）＋ 遷移 ALTER（部署步驟）
- `lib/sale.js`（`currentPrice` 重寫；新增 `activeWave`/`listPrice`/`isOnSale`；`salePhase` 擴充）
- `lib/sale.test.js`（波段測試）
- `app/api/payuni/checkout/route.js`（加 `isOnSale` 防呆）
- `app/page.jsx`（`sale` 物件擴充：state/onSale/salesStartAt/nextIncreaseAt）
- `app/HomeClient.jsx`（三態渲染＋倒數＋留信箱）
- `app/admin/SaleSettingsPage.jsx`（波段編輯器）
- `app/api/admin/sale-settings/route.js`（`list_price`/`waves` 驗證）
- `CLAUDE.md`（更新 sale_settings 模型說明）

**不動**：`middleware.js`、`lib/brevo-email.js`、`lib/launch-notify.js`、開課通知路由、`/api/coupons/validate`（已走 currentPrice）。

## 13. 部署步驟

1. Supabase 跑遷移 ALTER（§4）。
2. 部署程式碼（`npx vercel --prod`，自 worktree）。
3. 後台「銷售設定」填 `list_price` ＋ 三波 ＋ 開課日（§10）。
4. 驗證三態：今天（<7/8）首頁顯示「即將開賣＋倒數」、買鈕停用、教室鎖；可手動把第一波起始設成過去暫測「波段預售中」顯示（驗完還原）。
5. 真機驗 UI（手機）。

## 14. 不在本輪（Sub-2 提要）

現場 $2,500（序號卡）／粉絲 $3,499（線上驗證）＝「指定成交價」通路：需新增 `coupons.type='price'`（或等效）令 final＝指定價，並在 checkout 以有效序號價覆蓋當下波段價；粉絲身分驗證方式（人工發碼／名單匯入）另議。獨立 spec。
