# 銷售期間自動切換 CTA — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 營運者在後台設定「開課日／早鳥截止日／各方案原價・早鳥價」後，官網 CTA、價格、教室鎖站與開課通知信依當下時間自動切換，免重新部署。

**Architecture:** 單一真相來源 `sale_settings`（Supabase 單列表）。純邏輯抽 `lib/sale.js`（vitest 測試）。後端各路由用 service role 讀；middleware 用 anon + 60 秒快取讀；首頁改 server component 讀後傳 props 給 client。開課通知免費方案以「到訪者觸發 + 後台手動鈕」取代 sub-daily cron，CAS 保證只寄一次。

**Tech Stack:** Next.js 14 App Router、Supabase（`@supabase/supabase-js` / `@supabase/ssr`）、PAYUNi、Brevo、vitest。

## Global Constraints

- **價格權威在後端**：早鳥/原價判定一律在後端算，前端傳入價格不可信任。
- **金額**：新台幣整數。**時區**：存 `timestamptz`，後台以台灣時間（UTC+8）輸入/顯示，比較在 UTC。
- **優惠券疊加**：套在「當下基準價」（早鳥或原價）之上；既有限量券 CAS 預扣邏輯不可更動。
- **測試**：vitest，檔名 `lib/*.test.js`，**以相對路徑 import**（無 `@/` alias）。被測 lib 內部 import 也用相對路徑（`./plans.js`）。
- **使用者可見中文**：新前端中文字套既有 `word-break:keep-all; line-break:strict`（避免詞中斷行）。
- **手機 UI**：以 Vercel preview + 真機驗證（headless dev 不套 CSS module）。
- **Git**：在隔離分支/worktree 上進行（見 using-git-worktrees）；**平行 session 共用此工作目錄，commit 一律只 stage 明確路徑**。commit message 結尾加 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。
- **不動**：`NEXT_PUBLIC_PRESALE_MODE` 程式分支保留到全部驗證通過（Task 11 才清除）；`buildHtml` 既有 presale 分支邏輯不改、只改 `presale` 來源。

---

## File Structure

**新增**
- `lib/sale.js` — 純 helper（`isClassroomOpen`/`isEarlyBird`/`currentPrice`/`isPresale`/`salePhase`）+ `getSaleSettings`（service role 讀）。
- `lib/sale.test.js` — 純 helper 測試。
- `lib/launch-notify.js` — `runLaunchNotify(supabase, deps)`（CAS 搶佔 + 撈已付款 email + 寄信），依賴注入以利測試。
- `lib/launch-notify.test.js` — 以 mock supabase / sender 測 runLaunchNotify。
- `app/HomeClient.jsx` — 首頁 client 畫面（由 `app/page.jsx` 搬出），吃 `sale` props。
- `app/admin/SaleSettingsPage.jsx` — 後台「銷售設定」分頁。
- `app/api/admin/sale-settings/route.js` — GET/PATCH 單列。
- `app/api/admin/send-launch-notify/route.js` — 後台手動鈕（admin auth → runLaunchNotify）。
- `app/api/cron/sale-launch-notify/route.js` — Bearer CRON_SECRET → runLaunchNotify。

**修改**
- `lib/brevo-email.js` — `sendPurchaseEmail` 改吃 `presale` 參數；export `buildHtml`；新增 `buildLaunchHtml` + `sendLaunchEmail`。
- `app/api/payuni/checkout/route.js:46` — 基準價改 `currentPrice(...)`。
- `app/api/payuni/notify/route.js` — 算 `presale` 傳入 `sendPurchaseEmail`。
- `middleware.js` — 鎖站來源改 `sale_settings` 快取讀 + `isClassroomOpen`。
- `app/page.jsx` — 改 server component 讀設定、render `<HomeClient sale=...>` + 開課通知 lazy trigger。
- `app/admin/page.jsx` — 掛「銷售設定」nav + render。
- `supabase-deploy.sql` — 建 `sale_settings` + RLS + 預設列。
- `vercel.json` — （選配）每日保底 cron。
- `CLAUDE.md` — 文件更新。

---

## Task 1: 純邏輯 `lib/sale.js` + 測試

**Files:**
- Create: `lib/sale.js`
- Test: `lib/sale.test.js`

**Interfaces:**
- Consumes: `PLAN_CATALOG` from `./plans.js`、`getSupabaseAdmin` from `./supabase.js`。
- Produces:
  - `isClassroomOpen(settings, now=new Date()) → boolean`
  - `isEarlyBird(settings, now=new Date()) → boolean`
  - `currentPrice(plan, settings, now=new Date()) → number`
  - `isPresale(settings, now=new Date()) → boolean`
  - `salePhase(settings, now=new Date()) → { classroomOpen:boolean, earlyBird:boolean }`
  - `async getSaleSettings() → settings|null`
  - `settings` 形狀：`{ open_at, early_bird_ends_at, plan_pricing:{[plan]:{original,earlyBird}}, lock_override, launch_notified_at }`（可為 `null`）。

- [ ] **Step 1: 寫失敗測試 `lib/sale.test.js`**

```js
import { describe, it, expect } from "vitest";
import { isClassroomOpen, isEarlyBird, currentPrice, isPresale, salePhase } from "./sale.js";

const T0 = new Date("2026-08-15T00:00:00+08:00"); // 開課日
const EB = new Date("2026-07-31T23:59:59+08:00"); // 早鳥截止
const base = {
  open_at: T0.toISOString(),
  early_bird_ends_at: EB.toISOString(),
  plan_pricing: { course: { original: 3800, earlyBird: 3200 }, bundle: { original: 3999, earlyBird: 3499 } },
  lock_override: null,
  launch_notified_at: null,
};
const before = new Date("2026-07-01T00:00:00+08:00"); // 開課前 + 早鳥中
const between = new Date("2026-08-01T00:00:00+08:00"); // 早鳥已過 + 開課前
const after = new Date("2026-08-20T00:00:00+08:00"); // 開課後 + 早鳥已過

describe("isClassroomOpen", () => {
  it("override 'open' 一律開", () => expect(isClassroomOpen({ ...base, lock_override: "open" }, before)).toBe(true));
  it("override 'locked' 一律鎖", () => expect(isClassroomOpen({ ...base, lock_override: "locked" }, after)).toBe(false));
  it("無 open_at → 鎖", () => expect(isClassroomOpen({ ...base, open_at: null }, after)).toBe(false));
  it("now < open_at → 鎖", () => expect(isClassroomOpen(base, before)).toBe(false));
  it("now == open_at → 開", () => expect(isClassroomOpen(base, T0)).toBe(true));
  it("now > open_at → 開", () => expect(isClassroomOpen(base, after)).toBe(true));
  it("settings null → 鎖", () => expect(isClassroomOpen(null, after)).toBe(false));
});

describe("isEarlyBird", () => {
  it("now < 截止 → true", () => expect(isEarlyBird(base, before)).toBe(true));
  it("now >= 截止 → false", () => expect(isEarlyBird(base, between)).toBe(false));
  it("無截止日 → false", () => expect(isEarlyBird({ ...base, early_bird_ends_at: null }, before)).toBe(false));
  it("settings null → false", () => expect(isEarlyBird(null, before)).toBe(false));
});

describe("currentPrice", () => {
  it("早鳥中回早鳥價", () => expect(currentPrice("course", base, before)).toBe(3200));
  it("早鳥過回原價", () => expect(currentPrice("course", base, between)).toBe(3800));
  it("bundle 早鳥中", () => expect(currentPrice("bundle", base, before)).toBe(3499));
  it("方案缺 earlyBird → 回原價", () => expect(currentPrice("course", { ...base, plan_pricing: { course: { original: 3800 } } }, before)).toBe(3800));
  it("方案缺整筆 pricing → fallback PLAN_CATALOG", () => expect(currentPrice("course", { ...base, plan_pricing: {} }, before)).toBe(3800));
  it("settings null → fallback PLAN_CATALOG", () => expect(currentPrice("bundle", null, before)).toBe(3999));
});

describe("isPresale / salePhase", () => {
  it("開課前 isPresale=true", () => expect(isPresale(base, before)).toBe(true));
  it("開課後 isPresale=false", () => expect(isPresale(base, after)).toBe(false));
  it("salePhase 開課前+早鳥", () => expect(salePhase(base, before)).toEqual({ classroomOpen: false, earlyBird: true }));
  it("salePhase 開課後+原價", () => expect(salePhase(base, after)).toEqual({ classroomOpen: true, earlyBird: false }));
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/sale.test.js`
Expected: FAIL（`Failed to resolve import "./sale.js"` 或函式未定義）。

- [ ] **Step 3: 寫 `lib/sale.js`**

```js
// lib/sale.js — 銷售期間判定（純函式可測）+ 設定讀取
import { PLAN_CATALOG } from "./plans.js";
import { getSupabaseAdmin } from "./supabase.js";

// settings: { open_at, early_bird_ends_at, plan_pricing, lock_override, launch_notified_at } | null
export function isClassroomOpen(settings, now = new Date()) {
  if (!settings) return false;
  if (settings.lock_override === "open") return true;
  if (settings.lock_override === "locked") return false;
  if (!settings.open_at) return false;
  return now.getTime() >= new Date(settings.open_at).getTime();
}

export function isEarlyBird(settings, now = new Date()) {
  if (!settings || !settings.early_bird_ends_at) return false;
  return now.getTime() < new Date(settings.early_bird_ends_at).getTime();
}

export function currentPrice(plan, settings, now = new Date()) {
  const fallback = PLAN_CATALOG[plan]?.price ?? 0;
  const pricing = settings?.plan_pricing?.[plan];
  if (!pricing) return fallback;
  const original = Number.isFinite(pricing.original) ? pricing.original : fallback;
  if (isEarlyBird(settings, now) && Number.isFinite(pricing.earlyBird)) return pricing.earlyBird;
  return original;
}

export function isPresale(settings, now = new Date()) {
  return !isClassroomOpen(settings, now);
}

export function salePhase(settings, now = new Date()) {
  return { classroomOpen: isClassroomOpen(settings, now), earlyBird: isEarlyBird(settings, now) };
}

// 讀取單列設定（service role；server component / API / cron 用）
export async function getSaleSettings() {
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  const { data } = await sb.from("sale_settings").select("*").eq("id", "default").maybeSingle();
  return data || null;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/sale.test.js`
Expected: PASS（全部 it 綠燈）。

- [ ] **Step 5: Commit**

```bash
git add lib/sale.js lib/sale.test.js
git commit -m "feat(sale): add sale-period pure helpers + getSaleSettings

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 資料表 `sale_settings`（`supabase-deploy.sql`）

**Files:**
- Modify: `supabase-deploy.sql`（檔尾追加；idempotent）

**Interfaces:**
- Produces: 資料表 `sale_settings`（單列 `id='default'`），public 可 SELECT、service_role 可寫。

- [ ] **Step 1: 在 `supabase-deploy.sql` 檔尾追加**

```sql
-- ════════════════════════════════════════
-- 銷售期間設定 sale_settings（單列）
-- 開課日/早鳥截止日/各方案價格/手動覆寫/開課通知冪等旗標
-- ════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sale_settings (
  id                 TEXT PRIMARY KEY DEFAULT 'default',
  open_at            TIMESTAMPTZ,
  early_bird_ends_at TIMESTAMPTZ,
  plan_pricing       JSONB NOT NULL DEFAULT '{}'::jsonb,
  lock_override      TEXT,
  launch_notified_at TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sale_settings_singleton CHECK (id = 'default'),
  CONSTRAINT sale_settings_lock_override_chk
    CHECK (lock_override IS NULL OR lock_override IN ('open','locked'))
);

INSERT INTO sale_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

ALTER TABLE sale_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_write_sale_settings" ON sale_settings;
CREATE POLICY "service_role_write_sale_settings" ON sale_settings
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- SELECT 刻意對 public 開放（開課日/價格本就公開顯示；供 middleware 用 anon 讀）。
DROP POLICY IF EXISTS "public_read_sale_settings" ON sale_settings;
CREATE POLICY "public_read_sale_settings" ON sale_settings
  FOR SELECT USING (true);
```

- [ ] **Step 2: 在 Supabase SQL Editor 執行該段，驗證**

Run（Supabase SQL Editor）：貼上上述 SQL 後執行；再執行：
```sql
SELECT id, plan_pricing, lock_override FROM sale_settings;
```
Expected: 回一列 `default`、`plan_pricing = {}`、`lock_override = null`。

- [ ] **Step 3: Commit**

```bash
git add supabase-deploy.sql
git commit -m "feat(sale): add sale_settings table (public read, service_role write)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 後端價格權威（`checkout`）

**Files:**
- Modify: `app/api/payuni/checkout/route.js`

**Interfaces:**
- Consumes: `currentPrice`, `getSaleSettings` from `@/lib/sale`。
- Produces: checkout 的 `TradeAmt` / `orders.amount` 依當下早鳥狀態計算。

- [ ] **Step 1: 加入 import（檔案頂部 import 區）**

於 `app/api/payuni/checkout/route.js` 第 4 行 `import { PLAN_CATALOG, applyCoupon, couponError } from "@/lib/plans";` 之後新增：
```js
import { currentPrice, getSaleSettings } from "@/lib/sale";
```

- [ ] **Step 2: 改基準價來源**

將第 46 行：
```js
    let price = catalog.price;
```
改為：
```js
    const saleSettings = await getSaleSettings();
    let price = currentPrice(plan, saleSettings, new Date());
```
（`const label = catalog.label;` 維持不變；優惠券區塊 `applyCoupon(price, coupon)` 不動。）

- [ ] **Step 3: 驗證（手動整合）**

1. 在 `sale_settings` 設 `early_bird_ends_at` 為「未來」、`plan_pricing` 設 course `{original:3800,earlyBird:3200}`。
2. `npm run dev`，於首頁對 `course` 走結帳到 BuyModal，觀察送出的金額 / `orders.amount` = 3200。
3. 將 `early_bird_ends_at` 改成「過去」，重試 → 金額 = 3800。

Run: `npm run build`
Expected: build 成功（無型別/import 錯誤）。

- [ ] **Step 4: Commit**

```bash
git add app/api/payuni/checkout/route.js
git commit -m "feat(sale): checkout charges early-bird/original price from sale_settings

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 信件 presale 來源（`brevo-email` + `notify`）

**Files:**
- Modify: `lib/brevo-email.js`
- Modify: `app/api/payuni/notify/route.js`
- Test: `lib/brevo-email.test.js`（新增）

**Interfaces:**
- Consumes: `getSaleSettings`, `isPresale` from `@/lib/sale`（notify 端）。
- Produces: `sendPurchaseEmail({ email, plan, planLabel, merTradeNo, presale })`；export `buildHtml`。

- [ ] **Step 1: 寫失敗測試 `lib/brevo-email.test.js`**

```js
import { describe, it, expect } from "vitest";
import { buildHtml } from "./brevo-email.js";

describe("buildHtml presale 分支", () => {
  const args = { planLabel: "學琴全攻略", planUnlock: "課程＋AI", merTradeNo: "INREC1", loginUrl: "https://x/login" };
  it("presale=true → 預購文案、無登入按鈕", () => {
    const html = buildHtml({ ...args, presale: true });
    expect(html).toContain("預購成功");
    expect(html).not.toContain(args.loginUrl);
  });
  it("presale=false → 開通文案、含登入按鈕", () => {
    const html = buildHtml({ ...args, presale: false });
    expect(html).toContain("購買成功");
    expect(html).toContain(args.loginUrl);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/brevo-email.test.js`
Expected: FAIL（`buildHtml` 未被 export）。

- [ ] **Step 3: 改 `lib/brevo-email.js`**

(a) 將 `function buildHtml(...)`（第 22 行）改為 `export function buildHtml(...)`（其餘內容不變）。

(b) 將 `sendPurchaseEmail` 簽名與 presale 來源改為參數（第 62、72 行）：
```js
export async function sendPurchaseEmail({ email, plan, planLabel, merTradeNo, presale = false }) {
  const apiKey = process.env.BREVO_API_KEY;
  const sender = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !sender) {
    return { success: false, skipped: true, error: "missing_brevo_config" };
  }

  const siteUrl  = process.env.NEXT_PUBLIC_SITE_URL || "https://inrecordmusic.com";
  const loginUrl = `${siteUrl}/classroom/login`;
  const planUnlock = PLAN_UNLOCK[plan] || "已購買內容";
  // presale 由呼叫端（notify）依 sale_settings 計算後傳入
```
（移除原第 72 行 `const presale = process.env.NEXT_PUBLIC_PRESALE_MODE === "1";`；`subject`/`buildHtml({...presale})` 既有用法不變。）

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/brevo-email.test.js`
Expected: PASS。

- [ ] **Step 5: 改 `app/api/payuni/notify/route.js` 算 presale 並傳入**

(a) 頂部 import 區（第 6 行後）新增：
```js
import { getSaleSettings, isPresale } from "@/lib/sale";
```
(b) 將寄信呼叫（第 166-171 行）改為：
```js
              const saleSettings = await getSaleSettings();
              const mailResult = await sendPurchaseEmail({
                email:      order.email,
                plan:       order.plan,
                planLabel:  order.plan_label,
                merTradeNo: params.MerTradeNo,
                presale:    isPresale(saleSettings, new Date()),
              });
```

- [ ] **Step 6: 驗證 build**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 7: Commit**

```bash
git add lib/brevo-email.js lib/brevo-email.test.js app/api/payuni/notify/route.js
git commit -m "feat(sale): purchase email presale copy driven by sale_settings open_at

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: middleware 鎖站改讀 `sale_settings`（快取）

**Files:**
- Modify: `middleware.js`

**Interfaces:**
- Consumes: `isClassroomOpen` from `@/lib/sale`（純函式，無 DB 依賴，可在 edge 用）。
- Produces: 教室鎖站依 `open_at`/`lock_override` 自動切換；bypass token 與 matcher 不變。

- [ ] **Step 1: 改 `middleware.js`**

(a) 頂部新增 import：
```js
import { isClassroomOpen } from "@/lib/sale";
```
(b) 在 `export async function middleware` 之前，加入 module-scope 快取讀取（用 anon REST，靠 public SELECT policy）：
```js
let _saleCache = { value: null, at: 0 };
async function readSaleSettingsCached() {
  if (Date.now() - _saleCache.at < 60_000 && _saleCache.value !== null) return _saleCache.value;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const res = await fetch(
      `${url}/rest/v1/sale_settings?id=eq.default&select=open_at,lock_override`,
      { headers: { apikey: anon, Authorization: `Bearer ${anon}` } }
    );
    const rows = await res.json();
    _saleCache = { value: Array.isArray(rows) ? (rows[0] || null) : null, at: Date.now() };
  } catch {
    // 刷新失敗：沿用舊值；無舊值則維持 null（→ 鎖站，與「未設開課日」一致）
  }
  return _saleCache.value;
}
```
(c) 將第 10-11 行：
```js
  const presaleMode = process.env.NEXT_PUBLIC_PRESALE_MODE === "1";
  if (presaleMode) {
```
改為：
```js
  const settings = await readSaleSettingsCached();
  const presaleMode = !isClassroomOpen(settings, new Date());
  if (presaleMode) {
```
（其餘鎖站/bypass/cookie/`config.matcher` 全部不變。）

- [ ] **Step 2: 驗證（手動）**

1. `sale_settings.open_at` 設未來 → 存取 `/classroom`（未帶 preview）會 redirect 回 `/`。
2. `open_at` 設過去 → `/classroom` 不再被 middleware 擋。
3. `lock_override='locked'` 且 `open_at` 過去 → 仍鎖站。
4. 帶 `?preview=<PRESALE_BYPASS_TOKEN>` → 放行並種 cookie（不受影響）。

Run: `npm run build`
Expected: 成功。

- [ ] **Step 3: Commit**

```bash
git add middleware.js
git commit -m "feat(sale): classroom lock driven by sale_settings open_at (cached anon read)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: 首頁 server 化 + `HomeClient.jsx`

**Files:**
- Create: `app/HomeClient.jsx`
- Modify: `app/page.jsx`

**Interfaces:**
- Consumes: `getSaleSettings`, `salePhase`, `currentPrice` from `@/lib/sale`。
- Produces: `<HomeClient sale={sale} />`，`sale = { classroomOpen, earlyBird, openAt, earlyBirdEndsAt, plans: { [plan]: { price, originalPrice, isEarlyBird } } }`。

- [ ] **Step 1: 建 `app/HomeClient.jsx`（搬移現有畫面）**

將現有 `app/page.jsx` 的**全部內容**剪下貼到 `app/HomeClient.jsx`，並：
- 保留檔首 `"use client";`。
- 元件改名與簽名：`export default function HomeClient({ sale })`（原本是預設匯出的頁面元件）。
- 移除第 474 行 `const presaleMode = process.env.NEXT_PUBLIC_PRESALE_MODE === "1";`，改為：
```js
  const presaleMode = !sale.classroomOpen;
```

- [ ] **Step 2: 價格與文案改吃 `sale`**

於 `HomeClient.jsx`：

(a) 方案卡價格區塊（master `app/page.jsx:736-755`）將 `p.price` 改為由 `sale.plans[p.plan]` 取值，並在早鳥時顯示原價刪除線與標籤：
```jsx
                  <div className={styles.planPriceBlock}>
                    <div className={styles.planPriceRow}>
                      <span className={styles.planCurrency}>NT$</span>
                      <span className={styles.planPrice}>{sale.plans[p.plan].price.toLocaleString()}</span>
                      <span className={styles.planUnit}>／永久</span>
                    </div>
                    {sale.plans[p.plan].isEarlyBird && (
                      <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700 }}>
                        <span style={{ textDecoration: "line-through", color: "#94a3b8", marginRight: 8 }}>
                          NT${sale.plans[p.plan].originalPrice.toLocaleString()}
                        </span>
                        <span style={{ color: "#D4192C" }}>早鳥優惠</span>
                      </div>
                    )}
                  </div>
```
（按鈕內 `NT$${p.price...}` 改 `NT$${sale.plans[p.plan].price.toLocaleString()}`。）

(b) 購買鈕文案依 `sale.classroomOpen` 切「立即預購／立即購買」：nav（master 494）、hero（master 531）、cta（master 800）、sticky 購買鈕的「立即購買課程／立即購買」字串改為（行號為 master 版指引，實作前以實際檔案為準）：
```jsx
{sale.classroomOpen ? "立即購買課程" : "立即預購課程"}
```
（sticky 用「立即購買／立即預購」短版。）

(c) sticky bar 硬編碼價格（master 809 `NT$3,999`）改：
```jsx
          <span className={styles.stickyBuyPrice}>NT${sale.plans.bundle.price.toLocaleString()}</span>
```

- [ ] **Step 3: 建新的 server `app/page.jsx`**

將 `app/page.jsx` 內容整檔替換為：
```jsx
import HomeClient from "./HomeClient";
import { getSaleSettings, salePhase, currentPrice } from "@/lib/sale";
import { PLAN_CATALOG } from "@/lib/plans";

export const revalidate = 60;

export default async function Page() {
  const now = new Date();
  const settings = await getSaleSettings();
  const phase = salePhase(settings, now);

  const plans = {};
  for (const key of Object.keys(PLAN_CATALOG)) {
    const price = currentPrice(key, settings, now);
    const original = settings?.plan_pricing?.[key]?.original ?? PLAN_CATALOG[key].price;
    plans[key] = { price, originalPrice: original, isEarlyBird: phase.earlyBird && price < original };
  }

  const sale = {
    classroomOpen: phase.classroomOpen,
    earlyBird: phase.earlyBird,
    openAt: settings?.open_at ?? null,
    earlyBirdEndsAt: settings?.early_bird_ends_at ?? null,
    plans,
  };

  // 開課通知 lazy trigger（免費方案無 sub-daily cron）：開課後首位訪客觸發，CAS 去重。
  if (phase.classroomOpen && settings && !settings.launch_notified_at) {
    const site = process.env.NEXT_PUBLIC_SITE_URL;
    const secret = process.env.CRON_SECRET;
    if (site && secret) {
      fetch(`${site}/api/cron/sale-launch-notify`, { headers: { Authorization: `Bearer ${secret}` } }).catch(() => {});
    }
  }

  return <HomeClient sale={sale} />;
}
```

- [ ] **Step 4: 驗證**

Run: `npm run build`
Expected: 成功（首頁變 server component；`HomeClient` 為 client）。
手動：`npm run dev`，分別將 `open_at`/`early_bird_ends_at` 設過去/未來，重整首頁（最多等 60s ISR）驗證：CTA 文案（預購/購買）、方案卡早鳥價＋刪除線、sticky 價格、nav「課程準備中/進入教室」。

- [ ] **Step 5: Commit**

```bash
git add app/page.jsx app/HomeClient.jsx
git commit -m "feat(sale): homepage reads sale_settings server-side, CTA/price auto-switch

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: 後台 API `/api/admin/sale-settings`（GET/PATCH）

**Files:**
- Create: `app/api/admin/sale-settings/route.js`

**Interfaces:**
- Consumes: `verifyAdminToken` from `@/lib/adminAuth`、`getSupabaseAdmin` from `@/lib/supabase`。
- Produces: `GET → { data: settings }`；`PATCH(body) → { data: settings }`，body 欄位 `open_at?`, `early_bird_ends_at?`, `plan_pricing?`, `lock_override?`。

- [ ] **Step 1: 建 `app/api/admin/sale-settings/route.js`**

```js
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";

export async function GET(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const { data, error } = await sb.from("sale_settings").select("*").eq("id", "default").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data || null });
}

export async function PATCH(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const body = await req.json();
  const patch = { id: "default", updated_at: new Date().toISOString() };

  if ("open_at" in body) patch.open_at = body.open_at || null;
  if ("early_bird_ends_at" in body) patch.early_bird_ends_at = body.early_bird_ends_at || null;

  if ("lock_override" in body) {
    const v = body.lock_override;
    if (v !== null && v !== "open" && v !== "locked") {
      return NextResponse.json({ error: "invalid_lock_override" }, { status: 400 });
    }
    patch.lock_override = v;
  }

  if ("plan_pricing" in body) {
    const pricing = body.plan_pricing || {};
    for (const k of Object.keys(pricing)) {
      const p = pricing[k] || {};
      for (const f of ["original", "earlyBird"]) {
        if (p[f] != null && (!Number.isInteger(p[f]) || p[f] < 0)) {
          return NextResponse.json({ error: `invalid_price_${k}_${f}` }, { status: 400 });
        }
      }
    }
    patch.plan_pricing = pricing;
  }

  const { data, error } = await sb.from("sale_settings")
    .upsert(patch, { onConflict: "id" }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
```

- [ ] **Step 2: 驗證 build + 授權**

Run: `npm run build`
Expected: 成功。
手動：未帶 admin token 打 `GET /api/admin/sale-settings` → 401。

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/sale-settings/route.js
git commit -m "feat(sale): admin GET/PATCH sale-settings API (verifyAdminToken)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: 後台「銷售設定」分頁

**Files:**
- Create: `app/admin/SaleSettingsPage.jsx`
- Modify: `app/admin/page.jsx`

**Interfaces:**
- Consumes: `/api/admin/sale-settings`（GET/PATCH）、`/api/admin/send-launch-notify`（POST，Task 10 建立；本任務先放按鈕、呼叫端先做容錯）。
- Produces: nav id `"sale"` 對應 `<SaleSettingsPage/>`。

- [ ] **Step 1: 建 `app/admin/SaleSettingsPage.jsx`**

> admin API 需 `Authorization: Bearer <token>`。沿用本頁既有取 token 方式（與其他分頁一致，例如 `localStorage.getItem("inrec_admin_token")`；實作時對齊現有 fetch 慣例）。

```jsx
"use client";
import { useEffect, useState } from "react";

const PLANS = [
  { key: "course", label: "鋼琴自學全課程" },
  { key: "bundle", label: "學琴全攻略（課程包）" },
];

// timestamptz <-> <input type="datetime-local">（以瀏覽器本地時區即台灣時間呈現）
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v) { return v ? new Date(v).toISOString() : null; }

export default function SaleSettingsPage({ showToast }) {
  const [s, setS] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const token = typeof window !== "undefined" ? localStorage.getItem("inrec_admin_token") : "";
  const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetch("/api/admin/sale-settings", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setS(d.data || { open_at: null, early_bird_ends_at: null, plan_pricing: {}, lock_override: null, launch_notified_at: null }))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line

  if (loading || !s) return <div style={{ padding: 24 }}>載入中…</div>;

  const setPrice = (plan, field, val) => {
    const v = val === "" ? null : Number(val);
    setS((prev) => ({ ...prev, plan_pricing: { ...prev.plan_pricing, [plan]: { ...(prev.plan_pricing?.[plan] || {}), [field]: v } } }));
  };

  const save = async () => {
    setSaving(true);
    const res = await fetch("/api/admin/sale-settings", {
      method: "PATCH", headers: authHeaders,
      body: JSON.stringify({
        open_at: s.open_at, early_bird_ends_at: s.early_bird_ends_at,
        plan_pricing: s.plan_pricing, lock_override: s.lock_override,
      }),
    });
    const d = await res.json();
    setSaving(false);
    if (res.ok) { setS(d.data); showToast?.("已儲存"); } else { showToast?.(`儲存失敗：${d.error}`); }
  };

  const sendLaunch = async () => {
    if (!confirm("確定立即寄送開課通知給所有已預購買家？")) return;
    const res = await fetch("/api/admin/send-launch-notify", { method: "POST", headers: authHeaders });
    const d = await res.json().catch(() => ({}));
    if (res.ok) showToast?.(d.alreadyNotified ? "先前已寄送過" : `已寄送 ${d.sent ?? 0} 封`);
    else showToast?.(`寄送失敗：${d.error || res.status}`);
  };

  const field = { display: "block", marginBottom: 16 };
  const input = { padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 };

  return (
    <div style={{ padding: 24, maxWidth: 640, wordBreak: "keep-all", lineBreak: "strict" }}>
      <h2 style={{ marginTop: 0 }}>銷售設定</h2>

      <label style={field}>開課日（解鎖教室）
        <br /><input type="datetime-local" style={input} value={toLocalInput(s.open_at)}
          onChange={(e) => setS({ ...s, open_at: fromLocalInput(e.target.value) })} />
      </label>

      <label style={field}>早鳥截止日（之後恢復原價）
        <br /><input type="datetime-local" style={input} value={toLocalInput(s.early_bird_ends_at)}
          onChange={(e) => setS({ ...s, early_bird_ends_at: fromLocalInput(e.target.value) })} />
      </label>

      {PLANS.map((p) => (
        <div key={p.key} style={{ ...field, padding: 12, border: "1px solid #e2e8f0", borderRadius: 10 }}>
          <strong>{p.label}</strong><br />
          <span>原價 NT$ </span>
          <input type="number" min="0" style={input} value={s.plan_pricing?.[p.key]?.original ?? ""}
            onChange={(e) => setPrice(p.key, "original", e.target.value)} />
          <span style={{ marginLeft: 12 }}>早鳥價 NT$ </span>
          <input type="number" min="0" style={input} value={s.plan_pricing?.[p.key]?.earlyBird ?? ""}
            onChange={(e) => setPrice(p.key, "earlyBird", e.target.value)} />
        </div>
      ))}

      <label style={field}>手動覆寫
        <br />
        <select style={input} value={s.lock_override ?? ""}
          onChange={(e) => setS({ ...s, lock_override: e.target.value || null })}>
          <option value="">依排程（預設）</option>
          <option value="open">強制開課</option>
          <option value="locked">強制鎖站</option>
        </select>
      </label>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8 }}>
        <button onClick={save} disabled={saving}
          style={{ background: "#2563eb", color: "#fff", border: 0, borderRadius: 10, padding: "10px 18px", fontWeight: 800, cursor: "pointer" }}>
          {saving ? "儲存中…" : "儲存"}
        </button>
        <button onClick={sendLaunch}
          style={{ background: "#0f172a", color: "#fff", border: 0, borderRadius: 10, padding: "10px 18px", fontWeight: 800, cursor: "pointer" }}>
          立即寄送開課通知
        </button>
        <span style={{ fontSize: 13, color: "#64748b" }}>
          {s.launch_notified_at ? `已於 ${new Date(s.launch_notified_at).toLocaleString("zh-TW")} 寄送` : "尚未寄送"}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 掛進 `app/admin/page.jsx`**

(a) import 區（第 14-18 行附近，與其他分頁並列）新增：
```js
import SaleSettingsPage from "./SaleSettingsPage";
```
(b) lucide icon import 行加入 `CalendarClock`（與既有 `Settings, Shield, FileText` 同一個 `from "lucide-react"` import）。
(c) `NAV_GROUPS` 的「設定」群組（第 38-42 行）首項加入：
```js
    { id:"sale", label:"銷售設定", icon:CalendarClock },
```
(d) render 區（第 2466 行 `{page==="dashboard" ...}` 附近）新增一行：
```jsx
          {page==="sale"        &&<SaleSettingsPage showToast={showToast}/>}
```

- [ ] **Step 3: 驗證**

Run: `npm run build`
Expected: 成功。
手動：登入 `/admin` → 側欄「設定 → 銷售設定」可開啟、讀到目前值、改值存檔後 `GET` 回填一致。（「立即寄送開課通知」鈕於 Task 10 完成前會回 404，屬預期。）

- [ ] **Step 4: Commit**

```bash
git add app/admin/SaleSettingsPage.jsx app/admin/page.jsx
git commit -m "feat(sale): admin 銷售設定 page (dates, per-plan prices, override, manual notify)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: 開課通知邏輯 + 信件（`launch-notify` + `brevo-email`）

**Files:**
- Modify: `lib/brevo-email.js`（加 `buildLaunchHtml` + `sendLaunchEmail`）
- Create: `lib/launch-notify.js`
- Test: `lib/launch-notify.test.js`、擴充 `lib/brevo-email.test.js`

**Interfaces:**
- Produces:
  - `buildLaunchHtml({ loginUrl }) → string`、`async sendLaunchEmail({ email }) → { success, skipped?, error? }`
  - `async runLaunchNotify(supabase, { sendLaunchEmail, now=new Date() }) → { sent, alreadyNotified }`
    - CAS：`UPDATE sale_settings SET launch_notified_at WHERE id='default' AND launch_notified_at IS NULL`，0 列 → `{ alreadyNotified:true, sent:0 }`。
    - 撈 `orders.status='paid'` 去重 email，逐封寄 `sendLaunchEmail`，回 `sent`。

- [ ] **Step 1: 寫失敗測試 `lib/launch-notify.test.js`**

```js
import { describe, it, expect, vi } from "vitest";
import { runLaunchNotify } from "./launch-notify.js";

// 最小 supabase mock：sale_settings CAS + orders 查詢
function makeSupabase({ claimRows, orders }) {
  return {
    from(table) {
      if (table === "sale_settings") {
        return { update: () => ({ eq: () => ({ is: () => ({ select: () => Promise.resolve({ data: claimRows }) }) }) }) };
      }
      if (table === "orders") {
        return { select: () => ({ eq: () => Promise.resolve({ data: orders }) }) };
      }
      throw new Error("unexpected table " + table);
    },
  };
}

describe("runLaunchNotify", () => {
  it("搶佔成功 → 對去重 email 各寄一封", async () => {
    const sent = [];
    const sb = makeSupabase({ claimRows: [{ id: "default" }], orders: [
      { email: "a@x.com" }, { email: "b@x.com" }, { email: "a@x.com" },
    ]});
    const r = await runLaunchNotify(sb, { sendLaunchEmail: async ({ email }) => { sent.push(email); return { success: true }; } });
    expect(r).toEqual({ alreadyNotified: false, sent: 2 });
    expect(sent.sort()).toEqual(["a@x.com", "b@x.com"]);
  });

  it("CAS 搶佔失敗（已寄過）→ alreadyNotified、不寄信", async () => {
    const sent = [];
    const sb = makeSupabase({ claimRows: [], orders: [{ email: "a@x.com" }] });
    const r = await runLaunchNotify(sb, { sendLaunchEmail: async ({ email }) => { sent.push(email); return { success: true }; } });
    expect(r).toEqual({ alreadyNotified: true, sent: 0 });
    expect(sent).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/launch-notify.test.js`
Expected: FAIL（`runLaunchNotify` 未定義）。

- [ ] **Step 3: 在 `lib/brevo-email.js` 加開課信**

於檔尾新增（沿用既有 esc / 卡片樣式風格）：
```js
export function buildLaunchHtml({ loginUrl }) {
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f1f5f9;font-family:-apple-system,'Helvetica Neue',Arial,'PingFang TC','Microsoft JhengHei',sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px;">
    <div style="background:#fff;border-radius:20px;padding:36px 32px;box-shadow:0 12px 40px rgba(15,23,42,.08);">
      <div style="font-size:48px;text-align:center;margin-bottom:8px;">🎹</div>
      <h1 style="font-size:24px;color:#0f172a;text-align:center;margin:0 0 6px;">課程正式開課囉！</h1>
      <p style="color:#64748b;font-size:15px;text-align:center;margin:0 0 24px;">感謝你的預購，現在即可登入開始學習。</p>
      <div style="text-align:center;margin-bottom:20px;">
        <a href="${loginUrl}" style="display:inline-block;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;font-weight:800;padding:14px 32px;border-radius:12px;text-decoration:none;font-size:15px;">前往課程登入</a>
      </div>
      <p style="color:#64748b;font-size:13px;line-height:1.7;text-align:center;margin:0;">請使用<strong>當初購買的 Email</strong>登入即可看到已開通的內容。<br>如有任何問題，直接回覆此信與我們聯絡。</p>
    </div>
    <p style="color:#94a3b8;font-size:12px;text-align:center;margin:18px 0 0;">InRecord · 零基礎流行鋼琴入門課</p>
  </div>
</body></html>`;
}

export async function sendLaunchEmail({ email }) {
  const apiKey = process.env.BREVO_API_KEY;
  const sender = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !sender) return { success: false, skipped: true, error: "missing_brevo_config" };
  const siteUrl  = process.env.NEXT_PUBLIC_SITE_URL || "https://inrecordmusic.com";
  const loginUrl = `${siteUrl}/classroom/login`;
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({
        sender: { email: sender, name: process.env.BREVO_SENDER_NAME || "InRecord" },
        replyTo: { email: process.env.BREVO_REPLY_TO || "service@inrecordmusic.com", name: "InRecord 客服" },
        to: [{ email }],
        subject: "InRecord｜課程正式開課，立即登入學習 🎹",
        htmlContent: buildLaunchHtml({ loginUrl }),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok || res.status === 201) return { success: true, messageId: data.messageId };
    return { success: false, error: `brevo_${res.status}` };
  } catch (err) { return { success: false, error: err.message }; }
}
```

- [ ] **Step 4: 建 `lib/launch-notify.js`**

```js
// lib/launch-notify.js — 開課通知（CAS 搶佔保證只寄一次；依賴注入以利測試）
export async function runLaunchNotify(supabase, { sendLaunchEmail, now = new Date() }) {
  // 1) CAS 原子搶佔：只在 launch_notified_at 尚為 NULL 時成功
  const { data: claimed } = await supabase
    .from("sale_settings")
    .update({ launch_notified_at: now.toISOString() })
    .eq("id", "default")
    .is("launch_notified_at", null)
    .select("id");
  if (!claimed || claimed.length === 0) return { alreadyNotified: true, sent: 0 };

  // 2) 撈已付款訂單 email、去重
  const { data: orders } = await supabase.from("orders").select("email").eq("status", "paid");
  const emails = [...new Set((orders || []).map((o) => o.email).filter(Boolean))];

  // 3) 逐封寄送
  let sent = 0;
  for (const email of emails) {
    const r = await sendLaunchEmail({ email });
    if (r && r.success) sent++;
  }
  return { alreadyNotified: false, sent };
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run lib/launch-notify.test.js lib/brevo-email.test.js`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add lib/launch-notify.js lib/launch-notify.test.js lib/brevo-email.js lib/brevo-email.test.js
git commit -m "feat(sale): launch-notify logic (CAS once-only) + launch email

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: 開課通知路由 + lazy trigger + cron

**Files:**
- Create: `app/api/cron/sale-launch-notify/route.js`
- Create: `app/api/admin/send-launch-notify/route.js`
- Modify: `vercel.json`（選配每日保底）

**Interfaces:**
- Consumes: `runLaunchNotify` from `@/lib/launch-notify`、`sendLaunchEmail` from `@/lib/brevo-email`、`getSupabaseAdmin`、`verifyAdminToken`。（首頁 lazy trigger 已於 Task 6 接好，呼叫此 cron 端點。）

- [ ] **Step 1: 建 `app/api/cron/sale-launch-notify/route.js`**

```js
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { runLaunchNotify } from "@/lib/launch-notify";
import { sendLaunchEmail } from "@/lib/brevo-email";
import { isClassroomOpen } from "@/lib/sale";

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "no_db" }, { status: 500 });

  // 僅在「課程已開放」時才寄（override='locked' 不誤發）
  const { data: settings } = await sb.from("sale_settings").select("*").eq("id", "default").maybeSingle();
  if (!isClassroomOpen(settings, new Date())) {
    return NextResponse.json({ ok: true, skipped: "not_open" });
  }
  const r = await runLaunchNotify(sb, { sendLaunchEmail });
  return NextResponse.json({ ok: true, ...r });
}
```

- [ ] **Step 2: 建 `app/api/admin/send-launch-notify/route.js`（手動鈕）**

```js
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { runLaunchNotify } from "@/lib/launch-notify";
import { sendLaunchEmail } from "@/lib/brevo-email";

export async function POST(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  // 後台手動：不檢查 isClassroomOpen（營運者明確要寄）；CAS 仍保證只寄一次
  const r = await runLaunchNotify(sb, { sendLaunchEmail });
  return NextResponse.json({ ok: true, ...r });
}
```

- [ ] **Step 3: （選配）`vercel.json` 加每日保底 cron**

將 `crons` 陣列改為（若 Hobby 拒絕第二個 cron，略過本步驟，靠 lazy trigger + 手動鈕即可）：
```json
  "crons": [
    { "path": "/api/cron/release-coupons", "schedule": "0 4 * * *" },
    { "path": "/api/cron/sale-launch-notify", "schedule": "5 4 * * *" }
  ]
```

- [ ] **Step 4: 驗證**

Run: `npm run build`
Expected: 成功。
手動整合（dev）：
1. `sale_settings`：`open_at` 設過去、`launch_notified_at=NULL`、`orders` 至少一筆 `status='paid'`。
2. 後台按「立即寄送開課通知」→ 回 `sent>=1`，`launch_notified_at` 被寫入。
3. 再按一次 → 回 `alreadyNotified:true`、`sent:0`。
4. `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sale-launch-notify` → `alreadyNotified:true`（已被搶佔）。

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/sale-launch-notify/route.js app/api/admin/send-launch-notify/route.js vercel.json
git commit -m "feat(sale): launch-notify cron + admin manual trigger routes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: 文件、清除 `PRESALE_MODE`、部署檢查

**Files:**
- Modify: `CLAUDE.md`
- Verify: 全專案無殘留 `NEXT_PUBLIC_PRESALE_MODE`

**Interfaces:** 無新介面。

- [ ] **Step 1: 確認 env 引用已全部移除**

Run: `grep -rn "NEXT_PUBLIC_PRESALE_MODE" --include="*.js" --include="*.jsx" . | grep -v node_modules`
Expected: 無輸出（Task 4/5/6 已移除三處引用）。若仍有殘留，於對應檔案改為 `sale_settings` 對應邏輯後再續。

- [ ] **Step 2: 更新 `CLAUDE.md`**

- 將「預售鎖站靠 `NEXT_PUBLIC_PRESALE_MODE` + 重新部署」的描述改為：「銷售期間由 `sale_settings` 表驅動（開課日/早鳥截止/各方案價格/手動覆寫），後台『銷售設定』頁可改、免重新部署；middleware 60s 快取讀、首頁 60s ISR」。
- 主要 API 路由表新增：`/api/admin/sale-settings`、`/api/admin/send-launch-notify`、`/api/cron/sale-launch-notify`。
- 「部署需執行的 SQL」補上 `supabase-deploy.sql` 已含 `sale_settings`。

- [ ] **Step 3: 跑全測試 + build**

Run: `npx vitest run && npm run build`
Expected: 全綠、build 成功。

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(sale): document sale_settings model; retire NEXT_PUBLIC_PRESALE_MODE

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 5: 部署檢查清單（人工，部署後）**

1. Supabase 執行更新後 `supabase-deploy.sql`（建 `sale_settings`）。
2. 部署程式碼（依記憶：`npx vercel --prod`；推 GitHub 前 `gh auth switch --user inrecmusic`）。
3. 後台「銷售設定」填開課日/早鳥截止/各方案價格、覆寫＝依排程、存檔。
4. 驗證首頁 CTA/價格、教室鎖站、開課信文案隨設定切換（手機 UI 用 Vercel preview + 真機）。
5. 全部確認後，於 Vercel 移除 `NEXT_PUBLIC_PRESALE_MODE` 環境變數。
6. 確認 `CRON_SECRET` 已存在。

---

## Self-Review

**1. Spec coverage**
- 資料模型 → Task 2 ✓｜純邏輯 `lib/sale.js` → Task 1 ✓｜checkout 價格權威 → Task 3 ✓｜信件 presale → Task 4 ✓｜middleware 鎖站 → Task 5 ✓｜首頁 server 化 + CTA 2×2 + 早鳥顯示 + sticky → Task 6 ✓｜後台 API → Task 7 ✓｜後台 UI + 手動鈕 → Task 8 ✓｜開課通知邏輯 + 信件 + CAS 冪等 → Task 9 ✓｜cron + 手動路由 + lazy trigger（Task 6 接線）+ vercel.json → Task 10 ✓｜時區/預設/優惠券疊加/env 退場/文件 → Task 4/6/7/11 ✓。
- 注意：開課通知對象＝`orders.status='paid'` 去重 email（Task 9 runLaunchNotify）符合 spec「僅已預購買家」。

**2. Placeholder scan**：無 TBD/TODO；每個改碼步驟皆附完整程式或精確 diff 與行號。

**3. Type consistency**：`settings` 形狀（`open_at`/`early_bird_ends_at`/`plan_pricing`/`lock_override`/`launch_notified_at`）跨 Task 1/2/6/7/9/10 一致；`currentPrice(plan, settings, now)`、`isClassroomOpen(settings, now)`、`runLaunchNotify(supabase, { sendLaunchEmail, now })`、`sendPurchaseEmail({...,presale})`、`sale.plans[plan].{price,originalPrice,isEarlyBird}` 命名前後一致。

> 已知前後依賴：Task 8 的「立即寄送開課通知」鈕在 Task 10 完成前會回 404（已於 Task 8 Step 3 標註為預期）。
