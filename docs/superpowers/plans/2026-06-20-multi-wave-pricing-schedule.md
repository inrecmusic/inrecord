# 多波段價格排程（Sub-1）實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `sale_settings` 的定價從「單一早鳥」換成「正式牌價＋一串期間限定波段」，首頁／結帳依當下日期自動取對應波段價，並新增「即將開賣（第一波之前）」狀態。

**Architecture:** 純邏輯集中在 `lib/sale.js`（`currentPrice`/`saleState`/`salePhase`/`isOnSale`，vitest 測試）。`sale_settings` 改存 `list_price`＋`waves[]`。首頁 server component 用 `salePhase` 算出三態傳給 `HomeClient` 渲染。教室鎖站／開課信／開課通知維持現況（仍靠 `open_at`）。

**Tech Stack:** Next.js 14 App Router、Supabase、PAYUNi、Brevo、vitest。

## Global Constraints

- **測試**：vitest，`lib/*.test.js`，**相對路徑 import**（`./sale.js`）；`lib/sale.js` 內部 import 亦相對（`./plans.js`、`./supabase.js`）。
- **金額** TWD 整數。**時區**：存 `timestamptz`，後台台灣時間輸入，比較走 UTC。
- **波段價防呆**：取價一律 `Math.min(波段價, 牌價)`。
- **邊界**：波段 `starts_at` 含、`ends_at` 不含。`waves=[]` → 永遠 `list`（不為 `pre_launch`）。
- **per-plan 欄位名沿用 `originalPrice`**（語意已變為「牌價/list price」）以免動到 `HomeClient`/`BuyModal`。
- **不動**：`middleware.js`、`lib/brevo-email.js`、`lib/launch-notify.js`、開課通知路由、`/api/coupons/validate`（已走 `currentPrice`）、`components/BuyModal.jsx`。
- **新前端中文字**套 `word-break:keep-all; line-break:strict`。手機 UI 以 Vercel preview＋真機驗。
- **Git**：隔離 worktree；commit 只 stage 明確路徑；訊息結尾加 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

---

## File Structure

**修改**
- `lib/sale.js` — 重寫取價＋狀態機（waves）。
- `lib/sale.test.js` — 全面改為波段測試。
- `supabase-deploy.sql` — `sale_settings` CREATE 區塊改新欄位（＋部署步驟跑 ALTER 遷移）。
- `app/api/payuni/checkout/route.js` — 加 `isOnSale` 防呆。
- `app/api/admin/sale-settings/route.js` — 驗證改 `list_price`＋`waves`。
- `app/admin/SaleSettingsPage.jsx` — 改波段編輯器。
- `app/page.jsx` — `sale` 物件用新 `salePhase`。
- `app/HomeClient.jsx` — 三態渲染（價格區塊＋購買鈕＋倒數＋留信箱）。
- `CLAUDE.md` — 更新模型說明。

**新增**
- `components/Countdown.jsx` — 通用倒數顯示（client）。

---

## Task 1: `lib/sale.js` 取價狀態機 + 測試（TDD）

**Files:**
- Modify: `lib/sale.js`
- Modify: `lib/sale.test.js`（整檔替換）

**Interfaces:**
- Consumes: `PLAN_CATALOG` from `./plans.js`、`getSupabaseAdmin` from `./supabase.js`。
- Produces:
  - `activeWave(settings, now) → wave|null`
  - `listPrice(plan, settings) → number`
  - `currentPrice(plan, settings, now) → number`
  - `saleState(settings, now) → 'pre_launch'|'wave'|'list'`
  - `isOnSale(settings, now) → boolean`
  - `salePhase(settings, now) → { state, classroomOpen, onSale, salesStartAt, nextIncreaseAt, plans:{[plan]:{price, originalPrice, isEarlyBird}} }`
  - `isClassroomOpen`/`isPresale`/`getSaleSettings`（不變，保留）
  - settings 形狀：`{ open_at, lock_override, launch_notified_at, list_price:{[plan]:Int}, waves:[{starts_at,ends_at,prices:{[plan]:Int}}] }`
  - **移除** 舊 `isEarlyBird` export（無其他檔 import 它；確認後刪）。

- [ ] **Step 1: 整檔替換 `lib/sale.test.js`**

```js
import { describe, it, expect } from "vitest";
import { isClassroomOpen, isPresale, activeWave, listPrice, currentPrice, saleState, isOnSale, salePhase } from "./sale.js";

const iso = (s) => new Date(s).toISOString();
const settings = {
  open_at: iso("2026-09-04T00:00:00+08:00"),
  lock_override: null,
  launch_notified_at: null,
  list_price: { course: 6800, bundle: 5800 },
  waves: [
    { starts_at: iso("2026-07-08T00:00:00+08:00"), ends_at: iso("2026-07-20T00:00:00+08:00"), prices: { course: 5500, bundle: 4299 } },
    { starts_at: iso("2026-07-20T00:00:00+08:00"), ends_at: iso("2026-08-06T00:00:00+08:00"), prices: { course: 5800, bundle: 4799 } },
    { starts_at: iso("2026-08-06T00:00:00+08:00"), ends_at: iso("2026-09-04T00:00:00+08:00"), prices: { course: 6200, bundle: 5299 } },
  ],
};
const tPre  = new Date("2026-07-01T00:00:00+08:00");
const tW1   = new Date("2026-07-10T00:00:00+08:00");
const tW2   = new Date("2026-07-25T00:00:00+08:00");
const tW3   = new Date("2026-08-10T00:00:00+08:00");
const tList = new Date("2026-09-10T00:00:00+08:00");

describe("activeWave / currentPrice", () => {
  it("開賣前無波段", () => expect(activeWave(settings, tPre)).toBeNull());
  it("第一波命中", () => expect(activeWave(settings, tW1)?.prices.bundle).toBe(4299));
  it("第一波 bundle", () => expect(currentPrice("bundle", settings, tW1)).toBe(4299));
  it("第二波 course", () => expect(currentPrice("course", settings, tW2)).toBe(5800));
  it("第三波 bundle", () => expect(currentPrice("bundle", settings, tW3)).toBe(5299));
  it("牌價後 bundle", () => expect(currentPrice("bundle", settings, tList)).toBe(5800));
  it("開賣前回牌價（onSale 另擋）", () => expect(currentPrice("bundle", settings, tPre)).toBe(5800));
  it("起含 now==starts_at → 該波", () => expect(currentPrice("bundle", settings, new Date("2026-07-08T00:00:00+08:00"))).toBe(4299));
  it("迄不含 now==ends_at → 下一波", () => expect(currentPrice("bundle", settings, new Date("2026-07-20T00:00:00+08:00"))).toBe(4799));
  it("波段價>牌價 → 取牌價防呆", () =>
    expect(currentPrice("bundle", { ...settings, waves: [{ starts_at: settings.waves[0].starts_at, ends_at: settings.waves[0].ends_at, prices: { bundle: 9999 } }] }, tW1)).toBe(5800));
  it("無 waves → 牌價", () => expect(currentPrice("bundle", { ...settings, waves: [] }, tW1)).toBe(5800));
  it("settings null → PLAN_CATALOG", () => expect(currentPrice("bundle", null, tW1)).toBe(3999));
  it("list_price 缺 → PLAN_CATALOG", () => expect(currentPrice("course", { ...settings, list_price: {} }, tList)).toBe(3800));
});

describe("saleState / isOnSale", () => {
  it("開賣前 pre_launch", () => expect(saleState(settings, tPre)).toBe("pre_launch"));
  it("波段中 wave", () => expect(saleState(settings, tW2)).toBe("wave"));
  it("牌價 list", () => expect(saleState(settings, tList)).toBe("list"));
  it("無 waves → list（非 pre_launch）", () => expect(saleState({ ...settings, waves: [] }, tPre)).toBe("list"));
  it("isOnSale 開賣前 false", () => expect(isOnSale(settings, tPre)).toBe(false));
  it("isOnSale 波段中 true", () => expect(isOnSale(settings, tW1)).toBe(true));
});

describe("salePhase", () => {
  it("開賣前", () => {
    const p = salePhase(settings, tPre);
    expect(p.state).toBe("pre_launch");
    expect(p.onSale).toBe(false);
    expect(p.salesStartAt).toBe(settings.waves[0].starts_at);
    expect(p.classroomOpen).toBe(false);
  });
  it("波段中：早鳥價＋刪除線錨點＋nextIncreaseAt", () => {
    const p = salePhase(settings, tW1);
    expect(p.state).toBe("wave");
    expect(p.plans.bundle).toEqual({ price: 4299, originalPrice: 5800, isEarlyBird: true });
    expect(p.nextIncreaseAt).toBe(settings.waves[0].ends_at);
  });
  it("牌價＋開課", () => {
    const p = salePhase(settings, tList);
    expect(p.plans.course).toEqual({ price: 6800, originalPrice: 6800, isEarlyBird: false });
    expect(p.classroomOpen).toBe(true);
    expect(p.nextIncreaseAt).toBeNull();
  });
});

describe("isClassroomOpen / isPresale（沿用）", () => {
  it("開課前鎖", () => expect(isClassroomOpen(settings, tW1)).toBe(false));
  it("開課後開", () => expect(isClassroomOpen(settings, tList)).toBe(true));
  it("override locked", () => expect(isClassroomOpen({ ...settings, lock_override: "locked" }, tList)).toBe(false));
  it("isPresale 開課前 true", () => expect(isPresale(settings, tW1)).toBe(true));
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/sale.test.js`
Expected: FAIL（`activeWave`/`saleState`/`isOnSale` 未定義、舊 `salePhase` 形狀不符）。

- [ ] **Step 3: 整檔替換 `lib/sale.js`**

```js
// lib/sale.js — 銷售期間判定（純函式可測）+ 設定讀取
import { PLAN_CATALOG } from "./plans.js";
import { getSupabaseAdmin } from "./supabase.js";

// settings: { open_at, lock_override, launch_notified_at, list_price:{[plan]:Int}, waves:[{starts_at,ends_at,prices:{[plan]:Int}}] } | null

export function isClassroomOpen(settings, now = new Date()) {
  if (!settings) return false;
  if (settings.lock_override === "open") return true;
  if (settings.lock_override === "locked") return false;
  if (!settings.open_at) return false;
  return now.getTime() >= new Date(settings.open_at).getTime();
}

export function isPresale(settings, now = new Date()) {
  return !isClassroomOpen(settings, now);
}

// 依 starts_at 排序的有效波段
function sortedWaves(settings) {
  const ws = Array.isArray(settings?.waves) ? settings.waves : [];
  return ws
    .filter((w) => w && w.starts_at && w.ends_at)
    .slice()
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
}

// now ∈ [starts_at, ends_at) 的第一個波段；無則 null
export function activeWave(settings, now = new Date()) {
  const t = now.getTime();
  return (
    sortedWaves(settings).find(
      (w) => t >= new Date(w.starts_at).getTime() && t < new Date(w.ends_at).getTime()
    ) || null
  );
}

export function listPrice(plan, settings) {
  const lp = settings?.list_price?.[plan];
  return Number.isFinite(lp) ? lp : (PLAN_CATALOG[plan]?.price ?? 0);
}

export function currentPrice(plan, settings, now = new Date()) {
  const lp = listPrice(plan, settings);
  const w = activeWave(settings, now);
  if (w && Number.isFinite(w.prices?.[plan])) return Math.min(w.prices[plan], lp);
  return lp;
}

// 'pre_launch'（早於第一波）| 'wave'（命中波段）| 'list'（其餘：無波段/波段後/間隙）
export function saleState(settings, now = new Date()) {
  if (activeWave(settings, now)) return "wave";
  const ws = sortedWaves(settings);
  if (ws.length && now.getTime() < new Date(ws[0].starts_at).getTime()) return "pre_launch";
  return "list";
}

export function isOnSale(settings, now = new Date()) {
  return saleState(settings, now) !== "pre_launch";
}

export function salePhase(settings, now = new Date()) {
  const state = saleState(settings, now);
  const ws = sortedWaves(settings);
  const w = activeWave(settings, now);
  const plans = {};
  for (const key of Object.keys(PLAN_CATALOG)) {
    const price = currentPrice(key, settings, now);
    const lp = listPrice(key, settings);
    plans[key] = { price, originalPrice: lp, isEarlyBird: state === "wave" && price < lp };
  }
  return {
    state,
    classroomOpen: isClassroomOpen(settings, now),
    onSale: state !== "pre_launch",
    salesStartAt: ws.length ? ws[0].starts_at : null,
    nextIncreaseAt: w ? w.ends_at : null,
    plans,
  };
}

// 讀取單列設定（service role；server component / API / cron 用）
export async function getSaleSettings() {
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  const { data } = await sb.from("sale_settings").select("*").eq("id", "default").maybeSingle();
  return data || null;
}
```

- [ ] **Step 4: 確認無其他檔 import 已移除的 `isEarlyBird`**

Run: `grep -rn "isEarlyBird" --include="*.js" --include="*.jsx" app lib | grep -v node_modules`
Expected: 只剩 `lib/sale.js` 內 `salePhase` 產生的 `isEarlyBird` 屬性、與 `HomeClient`/`page` 讀 `sale.plans[*].isEarlyBird`（物件屬性，非 import）。**不可**有 `import { ... isEarlyBird ... }`。若有，該檔改用 `salePhase` 的 plans 屬性。

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run lib/sale.test.js`
Expected: PASS（全綠）。

- [ ] **Step 6: Commit**

```bash
git add lib/sale.js lib/sale.test.js
git commit -m "feat(pricing): wave-based currentPrice/saleState/salePhase + tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `sale_settings` 改版（schema + 遷移）

**Files:**
- Modify: `supabase-deploy.sql`

**Interfaces:**
- Produces: `sale_settings` 含 `list_price JSONB`、`waves JSONB`；移除 `plan_pricing`、`early_bird_ends_at`。

- [ ] **Step 1: 改 `supabase-deploy.sql` 的 `sale_settings` CREATE 區塊**

把 `CREATE TABLE IF NOT EXISTS sale_settings (...)` 內的欄位區，移除 `plan_pricing`、`early_bird_ends_at`，加入：
```sql
  list_price         JSONB NOT NULL DEFAULT '{}'::jsonb,
  waves              JSONB NOT NULL DEFAULT '[]'::jsonb,
```
（保留 `id`、`open_at`、`lock_override`、`launch_notified_at`、`updated_at` 與兩個 CHECK 約束、INSERT 預設列、RLS 政策不變。）

並在該區塊後追加「遷移（既有環境）」段（idempotent）：
```sql
-- 遷移：既有 sale_settings 從單一早鳥 → 波段模型
ALTER TABLE sale_settings ADD COLUMN IF NOT EXISTS list_price JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE sale_settings ADD COLUMN IF NOT EXISTS waves      JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE sale_settings DROP COLUMN IF EXISTS plan_pricing;
ALTER TABLE sale_settings DROP COLUMN IF EXISTS early_bird_ends_at;
```

- [ ] **Step 2: 驗證（人工，部署時於 Supabase 執行）**

於 Supabase SQL Editor 貼上上述 SQL → Run；再執行 `SELECT id, list_price, waves FROM sale_settings;`
Expected: 一列 `default`、`list_price={}`、`waves=[]`。
（subagent 無 DB 權限，本步驟記為部署手動步驟；本任務的程式碼交付＝改好 `supabase-deploy.sql`。）

- [ ] **Step 3: Commit**

```bash
git add supabase-deploy.sql
git commit -m "feat(pricing): sale_settings list_price + waves schema/migration

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 後台 API 驗證改版（`/api/admin/sale-settings`）

**Files:**
- Modify: `app/api/admin/sale-settings/route.js`

**Interfaces:**
- Consumes: `verifyAdminToken`、`getSupabaseAdmin`（不變）。
- Produces: PATCH 接受 `open_at`、`lock_override`、`list_price`、`waves`；驗證後 upsert。

- [ ] **Step 1: 替換 PATCH 內的欄位處理**

把現有 PATCH 中 `early_bird_ends_at`、`plan_pricing` 的處理（約第 23、33-44 行）整段移除，改為：

```js
  if ("list_price" in body) {
    const lp = body.list_price || {};
    for (const k of Object.keys(lp)) {
      if (lp[k] != null && (!Number.isInteger(lp[k]) || lp[k] < 0)) {
        return NextResponse.json({ error: `invalid_list_price_${k}` }, { status: 400 });
      }
    }
    patch.list_price = lp;
  }

  if ("waves" in body) {
    const waves = Array.isArray(body.waves) ? body.waves : null;
    if (!waves) return NextResponse.json({ error: "invalid_waves" }, { status: 400 });
    for (let i = 0; i < waves.length; i++) {
      const w = waves[i] || {};
      if (!w.starts_at || isNaN(Date.parse(w.starts_at)) || !w.ends_at || isNaN(Date.parse(w.ends_at))) {
        return NextResponse.json({ error: `invalid_wave_${i}_dates` }, { status: 400 });
      }
      if (Date.parse(w.starts_at) >= Date.parse(w.ends_at)) {
        return NextResponse.json({ error: `invalid_wave_${i}_range` }, { status: 400 });
      }
      const prices = w.prices || {};
      for (const k of Object.keys(prices)) {
        if (prices[k] != null && (!Number.isInteger(prices[k]) || prices[k] < 0)) {
          return NextResponse.json({ error: `invalid_wave_${i}_price_${k}` }, { status: 400 });
        }
      }
    }
    patch.waves = waves;
  }
```

（`open_at`、`lock_override` 的處理與 `upsert` 維持不變。）

- [ ] **Step 2: 驗證 build**

Run: `npm run build`
Expected: 成功。手動（部署後）：未帶 token → 401；帶非法 `waves`（如缺 `ends_at`）→ 400 `invalid_wave_0_dates`。

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/sale-settings/route.js
git commit -m "feat(pricing): admin sale-settings PATCH validates list_price + waves

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 後台波段編輯器（`SaleSettingsPage`）

**Files:**
- Modify: `app/admin/SaleSettingsPage.jsx`

**Interfaces:**
- Consumes: `/api/admin/sale-settings`（GET/PATCH，新結構）。
- Produces: 可編輯 `list_price`（course/bundle）＋ `waves[]`（增刪列：起、迄、course、bundle）。

- [ ] **Step 1: 改 `EMPTY_SETTINGS` 與 PATCH body**

`EMPTY_SETTINGS`（第 14 行）改為：
```js
const EMPTY_SETTINGS = { open_at: null, lock_override: null, launch_notified_at: null, list_price: {}, waves: [] };
```
`save()` 的 PATCH body（第 50-53 行）改為：
```js
        body: JSON.stringify({
          open_at: s.open_at, lock_override: s.lock_override,
          list_price: s.list_price || {}, waves: s.waves || [],
        }),
```

- [ ] **Step 2: 替換編輯區 JSX（牌價＋波段編輯器）**

把「早鳥截止日」label（第 81-84 行）與 `PLANS.map(...)` 價格卡（第 86-96 行）整段移除，改為以下（放在「開課日」label 之後、「手動覆寫」label 之前）：

```jsx
      <div style={{ ...field, padding: 12, border: "1px solid #e2e8f0", borderRadius: 10 }}>
        <strong>正式牌價（NT$，刪除線錨點＋波段後常態價）</strong><br />
        {PLANS.map((p) => (
          <span key={p.key} style={{ marginRight: 16, display: "inline-block" }}>
            {p.label}：<input type="number" min="0" style={input}
              value={s.list_price?.[p.key] ?? ""}
              onChange={(e) => setS((prev) => ({ ...prev, list_price: { ...prev.list_price, [p.key]: e.target.value === "" ? null : Number(e.target.value) } }))} />
          </span>
        ))}
      </div>

      <div style={field}>
        <strong>早鳥波段（依時間自動切換；起含、迄不含）</strong>
        {(s.waves || []).map((w, i) => (
          <div key={i} style={{ padding: 12, border: "1px solid #e2e8f0", borderRadius: 10, marginTop: 8 }}>
            <div style={{ marginBottom: 6 }}>第 {i + 1} 波
              <button onClick={() => setS((prev) => ({ ...prev, waves: prev.waves.filter((_, j) => j !== i) }))}
                style={{ marginLeft: 10, color: "#dc2626", border: 0, background: "none", cursor: "pointer" }}>刪除</button>
            </div>
            <label style={{ marginRight: 12 }}>起 <input type="datetime-local" style={input}
              value={toLocalInput(w.starts_at)}
              onChange={(e) => setWave(i, "starts_at", fromLocalInput(e.target.value))} /></label>
            <label style={{ marginRight: 12 }}>迄 <input type="datetime-local" style={input}
              value={toLocalInput(w.ends_at)}
              onChange={(e) => setWave(i, "ends_at", fromLocalInput(e.target.value))} /></label>
            <br />
            {PLANS.map((p) => (
              <span key={p.key} style={{ marginRight: 16, display: "inline-block", marginTop: 6 }}>
                {p.label} NT$ <input type="number" min="0" style={input}
                  value={w.prices?.[p.key] ?? ""}
                  onChange={(e) => setWavePrice(i, p.key, e.target.value)} />
              </span>
            ))}
          </div>
        ))}
        <button onClick={() => setS((prev) => ({ ...prev, waves: [...(prev.waves || []), { starts_at: null, ends_at: null, prices: {} }] }))}
          style={{ marginTop: 10, border: "1px solid #cbd5e1", background: "#f8fafc", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>＋ 新增波段</button>
      </div>
```

- [ ] **Step 3: 加入 `setWave` / `setWavePrice` helper**

在 `setPrice`（第 40-43 行，可一併移除舊 `setPrice`，已不用）之處改放：
```js
  const setWave = (i, key, val) =>
    setS((prev) => ({ ...prev, waves: prev.waves.map((w, j) => (j === i ? { ...w, [key]: val } : w)) }));
  const setWavePrice = (i, plan, val) =>
    setS((prev) => ({ ...prev, waves: prev.waves.map((w, j) => (j === i ? { ...w, prices: { ...(w.prices || {}), [plan]: val === "" ? null : Number(val) } } : w)) }));
```
（移除舊 `setPrice`；確認無其他引用。）

- [ ] **Step 4: 驗證 build**

Run: `npm run build`
Expected: 成功。手動（部署後）：可新增/刪除波段、填牌價與各波價、存檔後 GET 回填一致。

- [ ] **Step 5: Commit**

```bash
git add app/admin/SaleSettingsPage.jsx
git commit -m "feat(pricing): admin wave editor (list price + add/remove waves)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: checkout 開賣前防呆

**Files:**
- Modify: `app/api/payuni/checkout/route.js`

**Interfaces:**
- Consumes: `isOnSale` from `@/lib/sale`（Task 1）。

- [ ] **Step 1: import 加入 `isOnSale`**

把 `import { currentPrice, getSaleSettings } from "@/lib/sale";` 改為：
```js
import { currentPrice, getSaleSettings, isOnSale } from "@/lib/sale";
```

- [ ] **Step 2: 在取得 `saleSettings` 後、算價前加防呆**

`const saleSettings = await getSaleSettings();` 之後、`let price = currentPrice(...)` 之前插入：
```js
    if (!isOnSale(saleSettings, new Date())) {
      return NextResponse.json({ error: "not_on_sale" }, { status: 400 });
    }
```

- [ ] **Step 3: 驗證 build**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 4: Commit**

```bash
git add app/api/payuni/checkout/route.js
git commit -m "feat(pricing): block checkout before first wave (not_on_sale)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: 首頁 server 端 `sale` 物件（`app/page.jsx`）

**Files:**
- Modify: `app/page.jsx`

**Interfaces:**
- Consumes: `getSaleSettings`, `salePhase` from `@/lib/sale`（Task 1）。
- Produces: `<HomeClient sale={sale} />`，`sale = { state, onSale, classroomOpen, salesStartAt, nextIncreaseAt, plans:{[plan]:{price, originalPrice, isEarlyBird}} }`。

- [ ] **Step 1: 替換 Page() 主體**

把第 8-25 行（`const now`…`const sale = {...}`）改為：
```js
  const now = new Date();
  const settings = await getSaleSettings();
  const phase = salePhase(settings, now);

  const sale = {
    state: phase.state,
    onSale: phase.onSale,
    classroomOpen: phase.classroomOpen,
    salesStartAt: phase.salesStartAt,
    nextIncreaseAt: phase.nextIncreaseAt,
    plans: phase.plans,
  };
```
（移除對 `currentPrice`/`PLAN_CATALOG` 的 import 與 per-plan 手算；import 改為 `import { getSaleSettings, salePhase } from "@/lib/sale";`，刪掉 `currentPrice`、`PLAN_CATALOG` import。）

- [ ] **Step 2: lazy-trigger 改用 `phase.classroomOpen`（已是；確認不變）**

第 28-34 行的開課通知 lazy-trigger 保留，條件 `phase.classroomOpen && settings && !settings.launch_notified_at` 不變。

- [ ] **Step 3: 驗證 build**

Run: `npm run build`
Expected: 成功（`/` 仍為 server + ISR）。

- [ ] **Step 4: Commit**

```bash
git add app/page.jsx
git commit -m "feat(pricing): homepage builds sale from wave salePhase

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: 首頁三態渲染（`HomeClient` ＋ `Countdown`）

**Files:**
- Create: `components/Countdown.jsx`
- Modify: `app/HomeClient.jsx`

**Interfaces:**
- Consumes: `sale`（Task 6 形狀）。
- Produces: 三態 UI（pre_launch／wave／list）。

- [ ] **Step 1: 建 `components/Countdown.jsx`**

```jsx
"use client";
import { useEffect, useState } from "react";

// 顯示到 target（ISO）的倒數；過期回 null（不顯示）
export default function Countdown({ to, prefix = "", style }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!to) return null;
  const diff = new Date(to).getTime() - now;
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const txt = d > 0 ? `${d} 天 ${h} 時` : `${h} 時 ${m} 分 ${s} 秒`;
  return <span style={{ wordBreak: "keep-all", lineBreak: "strict", ...style }}>{prefix}{txt}</span>;
}
```

- [ ] **Step 2: HomeClient import Countdown**

在 `import BuyModal ...`（第 17 行附近）後加：
```jsx
import Countdown from "@/components/Countdown";
```

- [ ] **Step 3: 方案卡價格區塊三態（取代第 736-748 行 `planPriceBlock`）**

把現有 `<div className={styles.planPriceBlock}> ... </div>`（含 isEarlyBird 區塊）整段改為：

```jsx
                  <div className={styles.planPriceBlock}>
                    {sale.state === "pre_launch" ? (
                      <div className={styles.planPriceRow} style={{ fontWeight: 800, color: "#2563eb", wordBreak: "keep-all", lineBreak: "strict" }}>
                        即將開賣
                      </div>
                    ) : (
                      <>
                        <div className={styles.planPriceRow}>
                          <span className={styles.planCurrency}>NT$</span>
                          <span className={styles.planPrice}>{sale.plans[p.plan].price.toLocaleString()}</span>
                          <span className={styles.planUnit}>／永久</span>
                        </div>
                        {sale.plans[p.plan].isEarlyBird && (
                          <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700, wordBreak: "keep-all", lineBreak: "strict" }}>
                            <span style={{ textDecoration: "line-through", color: "#94a3b8", marginRight: 8 }}>
                              NT${sale.plans[p.plan].originalPrice.toLocaleString()}
                            </span>
                            <span style={{ color: "#D4192C" }}>早鳥優惠</span>
                            {sale.nextIncreaseAt && (
                              <Countdown to={sale.nextIncreaseAt} prefix="・漲價倒數 " style={{ color: "#D4192C", marginLeft: 4 }} />
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
```

- [ ] **Step 4: 方案卡購買鈕三態（取代第 762 行附近的鈕文案）**

方案卡內購買鈕（含 `{`${p.cta}　NT$${sale.plans[p.plan].price...}`}`）改為依狀態：開賣前停用、波段預購、牌價購買。把該 `<button ...>...</button>` 改為：
```jsx
                  <button
                    className={`${styles.planBtn} ${p.featured ? styles.planBtnFeatured : ""}`}
                    onClick={() => startBuy(p)}
                    disabled={!sale.onSale}
                    style={!sale.onSale ? { opacity: .55, cursor: "default" } : undefined}
                  >
                    <ShoppingCart size={17} />
                    {!sale.onSale
                      ? "即將開賣"
                      : `${sale.classroomOpen ? "立即購買" : "立即預購"}　NT$${sale.plans[p.plan].price.toLocaleString()}`}
                  </button>
```
（注意：保留原 `styles.planBtn`/`planBtnFeatured` 類名與 `ShoppingCart`；只改 disabled/文案。原本鈕的確切 class 以實際檔案為準。）

- [ ] **Step 5: nav／hero／cta／sticky 購買鈕三態**

四處購買鈕文案（第 494、531、808、821 行）由「`sale.classroomOpen ? "立即購買課程":"立即預購課程"`」改為三態。新增一個區域常數於元件內（`presaleMode` 宣告附近，第 474 行後）：
```jsx
  const buyLabel = !sale.onSale ? "即將開賣" : (sale.classroomOpen ? "立即購買課程" : "立即預購課程");
  const buyShort = !sale.onSale ? "即將開賣" : (sale.classroomOpen ? "立即購買" : "立即預購");
```
- 第 494（nav）、531（hero）、808（cta 區）：把字串改為 `{buyLabel}`，並在 `!sale.onSale` 時讓鈕 `disabled`（nav/hero/cta 的 onClick 在停用時不觸發；最小作法：`disabled={!sale.onSale}`）。
- 第 821（sticky）：`{buyShort}`，`disabled={!sale.onSale}`。
- 第 817（sticky 價格）：`!sale.onSale` 時改顯示「即將開賣」，否則維持 `NT${sale.plans.bundle.price.toLocaleString()}`：
```jsx
          <span className={styles.stickyBuyPrice}>{!sale.onSale ? "即將開賣" : `NT$${sale.plans.bundle.price.toLocaleString()}`}</span>
```

- [ ] **Step 6: 開賣前留信箱（pre_launch）**

先讀 `app/api/brevo/subscribe/route.js` 確認 request body 欄位（預期 `{ email }`）。在 hero CTA 區（第 531 行購買鈕附近），當 `!sale.onSale` 時，於購買鈕下方加入留信箱 + 開賣倒數：
```jsx
                {!sale.onSale && (
                  <div style={{ marginTop: 12, wordBreak: "keep-all", lineBreak: "strict" }}>
                    {sale.salesStartAt && <Countdown to={sale.salesStartAt} prefix="早鳥開賣倒數 " style={{ fontWeight: 800, color: "#2563eb" }} />}
                    <NotifyMeForm />
                  </div>
                )}
```
並在 HomeClient 內新增子元件（檔案上方、`export default function HomeClient` 之前）：
```jsx
function NotifyMeForm() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const submit = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setErr("請輸入正確 Email"); return; }
    setErr("");
    try {
      const r = await fetch("/api/brevo/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      if (r.ok) setDone(true); else setErr("訂閱失敗，請稍後再試");
    } catch { setErr("訂閱失敗，請稍後再試"); }
  };
  if (done) return <p style={{ marginTop: 8, color: "#16a34a", fontWeight: 700 }}>✅ 開賣會 Email 通知你！</p>;
  return (
    <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
      <input type="email" value={email} placeholder="留 Email，開賣通知我" onChange={(e) => setEmail(e.target.value)}
        style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }} />
      <button onClick={submit} style={{ background: "#2563eb", color: "#fff", border: 0, borderRadius: 8, padding: "8px 14px", fontWeight: 800, cursor: "pointer" }}>通知我</button>
      {err && <span style={{ color: "#dc2626", fontSize: 13 }}>{err}</span>}
    </div>
  );
}
```
（`useState` 已於 HomeClient 檔案 import；`NotifyMeForm` 為同檔內 client 子元件。`/api/brevo/subscribe` 若欄位非 `email`，依實際調整。）

- [ ] **Step 7: 驗證 build**

Run: `npm run build`
Expected: 成功。
手動（dev／preview）：把 `sale_settings.waves` 設成第一波在未來 → 首頁顯示「即將開賣＋倒數＋留信箱」、買鈕停用；設第一波涵蓋現在 → 顯示牌價刪除線＋早鳥價＋漲價倒數＋「立即預購」；把 `open_at` 設過去 → 「立即購買」＋教室開。

- [ ] **Step 8: Commit**

```bash
git add components/Countdown.jsx app/HomeClient.jsx
git commit -m "feat(pricing): homepage 3-state (pre-launch/wave/list) + countdowns + notify-me

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: 文件（`CLAUDE.md`）

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 更新 sale_settings 段落**

把 `CLAUDE.md` 中描述 `sale_settings`「單一早鳥（`plan_pricing`/`early_bird_ends_at`）」的部分，改為「**多波段定價**：`list_price`（正式牌價＝刪除線錨點＋波段後常態價）＋ `waves[]`（期間限定，起含迄不含，依當下時間自動取價）；首頁三態：即將開賣（第一波前，不可買＋留信箱）／早鳥預售（波段中，預購＋漲價倒數）／正式牌價（＋開課解鎖）。checkout 以 `isOnSale` 擋開賣前購買。教室鎖站/開課信/開課通知仍由 `open_at` 驅動。」做 surgical 編輯，其餘不動。

- [ ] **Step 2: 全測試 + build**

Run: `npx vitest run && npm run build`
Expected: 全綠、build 成功。

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(pricing): document multi-wave sale_settings model

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage**
- 資料模型 list_price/waves + 遷移 → Task 2 ✓｜狀態機 currentPrice/saleState/salePhase/isOnSale → Task 1 ✓｜checkout not_on_sale → Task 5 ✓｜首頁三態＋倒數＋留信箱 → Task 6/7 ✓｜後台波段編輯器 → Task 4 ✓｜API 驗證 → Task 3 ✓｜測試 → Task 1 ✓｜文件 → Task 8 ✓。
- 不動項（middleware/brevo-email/launch-notify/coupons-validate/BuyModal）→ 計畫未觸及 ✓。
- 上線設定值（§10）→ 部署時後台輸入，非程式碼（Task 2 Step 2 + 部署）✓。

**2. Placeholder scan**：每個改碼步驟皆附完整程式或精確 diff＋行號。`/api/brevo/subscribe` 欄位於 Task 7 Step 6 要求先讀該檔確認（讀後實作，非佔位）。

**3. Type consistency**：`salePhase` 回傳 `{state,onSale,classroomOpen,salesStartAt,nextIncreaseAt,plans:{[plan]:{price,originalPrice,isEarlyBird}}}` 跨 Task 1/6/7 一致；`sale.state`／`sale.onSale`／`sale.nextIncreaseAt`／`sale.salesStartAt`／`sale.plans[plan].{price,originalPrice,isEarlyBird}` 在 HomeClient 用法一致；per-plan 欄位沿用 `originalPrice`（=牌價）一致於 page/HomeClient/BuyModal（BuyModal 不變）。`currentPrice`/`isOnSale` 簽名一致於 checkout。

> 已知前後依賴：Task 7 的 BuyModal 在 pre_launch 不會被開啟（買鈕 disabled），故 BuyModal 無需改。
