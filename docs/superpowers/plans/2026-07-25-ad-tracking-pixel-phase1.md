# 廣告追蹤碼中心 + UTM 歸因（Phase 1）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 InRecord 後臺自建「追蹤碼中心」多平台埋 Pixel（Meta / GA4 / Google Ads / LINE，即時開關免部署），前台觸發 PageView / ViewContent / InitiateCheckout / Purchase 事件，並把 UTM last-touch 寫進成交訂單。

**Architecture:** 複用現有 `sale_settings` 的「單列設定、後臺即時改」模式，新增 `tracking_settings` 單列表存各平台 config（JSONB）。`app/layout.jsx`（Server Component）用 `unstable_cache` 讀設定 → 以 `next/script` 只注入已啟用平台的 base snippet；client 端 `RouteChangeTracker` 補打 SPA 換頁事件並擷取 UTM；`/success` 回查訂單金額打 Purchase。事件分派集中在 `lib/track-event.js`，設定 I/O 與純函式集中在 `lib/tracking.js`、`lib/attribution.js`。

**Tech Stack:** Next.js 14.2.35（App Router）、React 18、Supabase（`getSupabaseAdmin`）、jose（admin JWT）、Vitest 4 + @testing-library/react（jsdom）、Meta Pixel / gtag.js（GA4+Google Ads）/ LINE Tag。

## Global Constraints

- **語言**：所有使用者可見文案一律繁體中文。
- **中文斷行**：新增 UI 文案套用專案慣例 `word-break: keep-all; line-break: strict`（避免中文詞被拆行）。
- **平台**：Phase 1 僅 Meta / GA4 / Google Ads / LINE；不做 TikTok（config 以 JSONB 預留）、不做 Cookie 同意橫幅、不串任何廣告 API、不存任何 API token。
- **歸因**：last-touch；本次落地為 direct（無任何 UTM/click id）時**不覆蓋**既有 cookie。
- **設定表慣例**：`tracking_settings` 用 `id text = 'default'` 單列，`upsert(..., { onConflict: 'id' })`，比照 `sale_settings`。
- **後臺 API**：JWT 走 `verifyAdminToken(req)`（Bearer，`@/lib/adminAuth`）；DB 走 `getSupabaseAdmin()`；變更寫 `logAudit(...)`；前端帶 token 用 `sessionStorage.getItem("inrecord_admin_token")`。
- **Pixel snippet**：實作各平台 base/事件 snippet 時，以 Context7／各平台官方文件核對最新版本後再落地。
- **測試**：Vitest；純函式用預設 node 環境；需 DOM 的測試在檔案頂端加 `// @vitest-environment jsdom`；單檔執行 `npx vitest run <path>`，全部 `npm test`。
- **Git**：在 `feat/point2-carousel` 分支；本機有平行 session → **只 `git add` 明確路徑**（禁 `git add -A`），commit 前先 `git rev-parse --abbrev-ref HEAD` 確認分支；commit 訊息結尾加一行 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- **部署（全部完成後一次做）**：`gh auth switch --user inrecmusic` 再推；InRecord 未接 GitHub 自動部署 → 手動 `npx vercel --prod`；SQL 於正式 DB（Supabase 專案 `vmslzbcegfljlopkewpx`）執行。

---

## 檔案結構

**新增**
- `supabase-tracking.sql` — 建 `tracking_settings` 表 + `orders.attribution` 欄
- `lib/tracking.js` — 設定純函式（`enabledPlatforms` / `sanitizeTrackingConfig` / snippet builders）+ server `getTrackingSettings`
- `lib/tracking.test.js`
- `lib/attribution.js` — `parseAttribution` / `hasTouch` / `mergeLastTouch` + cookie helpers + `captureAttribution`
- `lib/attribution.test.js`
- `lib/attribution-report.js` — `groupBySource(orders)`
- `lib/attribution-report.test.js`
- `lib/track-event.js` — `trackEvent` / `trackGoogleAdsConversion` / `trackLineConversion`
- `lib/track-event.test.js`
- `components/tracking/TrackingScripts.jsx` — server，注入已啟用平台 base script
- `components/tracking/RouteChangeTracker.jsx` — client，SPA 換頁補事件 + 擷取 UTM
- `components/tracking/PurchaseTracking.jsx` — client，/success 打 Purchase（localStorage 去重）
- `components/admin/SourceAttributionTable.jsx` — 後臺來源歸因表
- `app/admin/TrackingSettingsPage.jsx` — 後臺「追蹤碼」分頁
- `app/api/admin/tracking-settings/route.js` — GET/PATCH

**修改**
- `app/layout.jsx` — 注入 TrackingScripts + RouteChangeTracker
- `app/success/page.jsx` — 回查訂單 → PurchaseTracking
- `components/BuyModal.jsx` — InitiateCheckout + checkout body 帶 attribution
- `app/api/payuni/checkout/route.js` — 寫 `orders.attribution`
- `app/HomeClient.jsx` — 對 `#pricing` 掛進場觀察，打 ViewContent
- `app/admin/page.jsx` — 新增「追蹤碼」nav 與掛載；分析頁掛來源歸因表
- `app/privacy/page.jsx` — 追蹤揭露文字

> 註：「系統設定」分頁現有一個 localStorage 版「分析追蹤設定」(`LS_ANALYTICS`)，純前端存、不會真的注入 Pixel。新「追蹤碼」分頁是真正實作；實作 Task 11 時確認舊區塊要保留或移除（本計畫預設保留、不動它）。

---

## Task 1: 資料庫遷移（tracking_settings + orders.attribution）

**Files:**
- Create: `supabase-tracking.sql`

**Interfaces:**
- Produces: `tracking_settings(id text pk='default', config jsonb, updated_at timestamptz)` 單列；`orders.attribution jsonb`（nullable）。

- [ ] **Step 1: 寫遷移 SQL**

Create `supabase-tracking.sql`:

```sql
-- 追蹤碼中心：單列設定表（比照 sale_settings 的 id='default' 慣例）
create table if not exists tracking_settings (
  id         text primary key default 'default',
  config     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into tracking_settings (id, config) values ('default', '{}'::jsonb)
  on conflict (id) do nothing;

-- 訂單歸因快照（last-touch UTM / click id / landing）
alter table orders add column if not exists attribution jsonb;
```

- [ ] **Step 2: 在正式 DB 執行**

用 Supabase SQL Editor（專案 `vmslzbcegfljlopkewpx`）貼上執行，或用 MCP：`mcp__plugin_supabase_supabase__apply_migration`（name: `tracking_phase1`, query: 上述 SQL）。

- [ ] **Step 3: 驗證**

在 SQL Editor 執行：
```sql
select id, config from tracking_settings;                 -- 應回 1 列，config = {}
select column_name from information_schema.columns
  where table_name='orders' and column_name='attribution'; -- 應回 attribution
```
Expected: `tracking_settings` 有一列 `default / {}`；`orders` 有 `attribution` 欄。

- [ ] **Step 4: Commit**

```bash
git rev-parse --abbrev-ref HEAD   # 確認 feat/point2-carousel
git add supabase-tracking.sql
git commit -m "feat(tracking): add tracking_settings table and orders.attribution column"
```

---

## Task 2: lib/tracking.js（設定純函式 + snippet builders + server 讀取）

**Files:**
- Create: `lib/tracking.js`
- Test: `lib/tracking.test.js`

**Interfaces:**
- Produces:
  - `enabledPlatforms(config) -> { meta:{id}|null, ga4:{id}|null, googleAds:{id,purchaseLabel}|null, line:{id}|null }`
  - `sanitizeTrackingConfig(body) -> { ok:true, config } | { ok:false, error }`，`config` 形狀 `{ meta:{id,enabled}, ga4:{id,enabled}, google_ads:{id,purchase_label,enabled}, line:{id,enabled} }`
  - `metaSnippet(id) -> string`、`googleConfigSnippet({ga4Id,adsId}) -> string`、`lineSnippet(id) -> string`
  - `getTrackingSettings() -> Promise<ReturnType<enabledPlatforms>>`（server、`unstable_cache` tag `"tracking-settings"`）

- [ ] **Step 1: 寫失敗測試**

Create `lib/tracking.test.js`:

```js
import { describe, it, expect } from "vitest";
import { enabledPlatforms, sanitizeTrackingConfig, metaSnippet, googleConfigSnippet, lineSnippet } from "./tracking.js";

describe("enabledPlatforms", () => {
  it("只回傳 enabled 且有 id 的平台", () => {
    const out = enabledPlatforms({
      meta: { id: "123", enabled: true },
      ga4: { id: "G-A", enabled: false },
      google_ads: { id: "AW-1", purchase_label: "lab", enabled: true },
      line: { id: "", enabled: true },
    });
    expect(out.meta).toEqual({ id: "123" });
    expect(out.ga4).toBeNull();                 // enabled=false
    expect(out.googleAds).toEqual({ id: "AW-1", purchaseLabel: "lab" });
    expect(out.line).toBeNull();                // id 空
  });
  it("空 config 全為 null", () => {
    const out = enabledPlatforms({});
    expect(out).toEqual({ meta: null, ga4: null, googleAds: null, line: null });
  });
});

describe("sanitizeTrackingConfig", () => {
  it("normalize 並保留四平台", () => {
    const r = sanitizeTrackingConfig({ meta: { id: " 123 ", enabled: true }, ga4: { id: "G-A", enabled: 1 } });
    expect(r.ok).toBe(true);
    expect(r.config.meta).toEqual({ id: "123", enabled: true });
    expect(r.config.ga4).toEqual({ id: "G-A", enabled: true });
    expect(r.config.line).toEqual({ id: "", enabled: false });
  });
  it("啟用卻無 id → 錯誤", () => {
    const r = sanitizeTrackingConfig({ meta: { id: "", enabled: true } });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("meta_id_required");
  });
});

describe("snippet builders", () => {
  it("metaSnippet 含 init 與 id", () => {
    const s = metaSnippet("999");
    expect(s).toContain("fbq('init','999')");
    expect(s).toContain("fbq('track','PageView')");
  });
  it("googleConfigSnippet 依有無 id 產出 config", () => {
    expect(googleConfigSnippet({ ga4Id: "G-A", adsId: "AW-1" })).toContain("gtag('config','G-A')");
    expect(googleConfigSnippet({ ga4Id: "G-A", adsId: "AW-1" })).toContain("gtag('config','AW-1')");
    expect(googleConfigSnippet({ adsId: "AW-1" })).not.toContain("G-");
  });
  it("lineSnippet 含 tagId", () => {
    expect(lineSnippet("T1")).toContain("tagId:'T1'");
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run lib/tracking.test.js`
Expected: FAIL（`tracking.js` 尚未建立 / 匯出未定義）。

- [ ] **Step 3: 實作**

Create `lib/tracking.js`:

```js
// lib/tracking.js — 追蹤碼設定：純函式（可測）+ server 讀取
import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "./supabase.js";

const PLATFORMS = ["meta", "ga4", "google_ads", "line"];

// 儲存用 config -> 注入用「已啟用平台」（缺鍵/未啟用/無 id 一律 null）
export function enabledPlatforms(config = {}) {
  const c = config || {};
  const on = (p) => p && p.enabled === true && String(p.id || "").trim();
  return {
    meta: on(c.meta) ? { id: String(c.meta.id).trim() } : null,
    ga4: on(c.ga4) ? { id: String(c.ga4.id).trim() } : null,
    googleAds: on(c.google_ads)
      ? { id: String(c.google_ads.id).trim(), purchaseLabel: String(c.google_ads.purchase_label || "").trim() }
      : null,
    line: on(c.line) ? { id: String(c.line.id).trim() } : null,
  };
}

// 後臺 PATCH body -> normalize 後的 config；啟用卻無 id 視為錯誤
export function sanitizeTrackingConfig(body = {}) {
  const b = body || {};
  const out = {};
  for (const key of PLATFORMS) {
    const p = b[key] || {};
    const id = String(p.id || "").trim();
    const enabled = !!p.enabled;
    if (enabled && !id) return { ok: false, error: `${key}_id_required` };
    if (key === "google_ads") out[key] = { id, purchase_label: String(p.purchase_label || "").trim(), enabled };
    else out[key] = { id, enabled };
  }
  return { ok: true, config: out };
}

export function metaSnippet(id) {
  return `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${id}');fbq('track','PageView');`;
}

export function googleConfigSnippet({ ga4Id, adsId } = {}) {
  return `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());${ga4Id ? `gtag('config','${ga4Id}');` : ""}${adsId ? `gtag('config','${adsId}');` : ""}`;
}

export function lineSnippet(id) {
  return `(function(g,d,o){g._ltq=g._ltq||[];g._lt=g._lt||function(){g._ltq.push(arguments)};var s=d.createElement('script');s.async=1;s.src=o||'https://d.line-scdn.net/n/line_tag/public/release/v1/lt.js';var t=d.getElementsByTagName('script')[0];t.parentNode.insertBefore(s,t)})(window,document);_lt('init',{customerType:'lap',tagId:'${id}'});_lt('send','pv',['${id}']);`;
}

async function readConfig() {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return {};
    const { data } = await sb.from("tracking_settings").select("config").eq("id", "default").maybeSingle();
    return data?.config || {};
  } catch {
    return {};
  }
}

// layout 用：跨請求快取，後臺存檔時以 revalidateTag("tracking-settings") 失效
export const getTrackingSettings = unstable_cache(
  async () => enabledPlatforms(await readConfig()),
  ["tracking-settings-v1"],
  { tags: ["tracking-settings"] }
);
```

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run lib/tracking.test.js`
Expected: PASS（全部綠）。

- [ ] **Step 5: Commit**

```bash
git add lib/tracking.js lib/tracking.test.js
git commit -m "feat(tracking): settings helpers, sanitizer and pixel snippet builders"
```

---

## Task 3: lib/attribution.js（UTM 解析 / last-touch / cookie）

**Files:**
- Create: `lib/attribution.js`
- Test: `lib/attribution.test.js`

**Interfaces:**
- Produces:
  - `parseAttribution(search: string|URLSearchParams) -> object`（只含有值的 utm_* / gclid / fbclid）
  - `hasTouch(attr) -> boolean`
  - `mergeLastTouch(prev, next) -> object|null`
  - `readAttributionCookie() -> object|null`（browser）
  - `captureAttribution() -> object|null`（browser；direct 不覆蓋）

- [ ] **Step 1: 寫失敗測試**

Create `lib/attribution.test.js`:

```js
import { describe, it, expect } from "vitest";
import { parseAttribution, hasTouch, mergeLastTouch } from "./attribution.js";

describe("parseAttribution", () => {
  it("擷取 utm 與 click id，忽略空值", () => {
    const out = parseAttribution("utm_source=facebook&utm_campaign=summer&fbclid=abc&foo=bar");
    expect(out).toEqual({ utm_source: "facebook", utm_campaign: "summer", fbclid: "abc" });
  });
  it("無參數回空物件", () => {
    expect(parseAttribution("")).toEqual({});
  });
});

describe("hasTouch", () => {
  it("有任一來源值為 true", () => expect(hasTouch({ utm_source: "fb" })).toBe(true));
  it("空為 false", () => { expect(hasTouch({})).toBe(false); expect(hasTouch(null)).toBe(false); });
});

describe("mergeLastTouch", () => {
  it("next 有 touch → 覆蓋", () => {
    expect(mergeLastTouch({ utm_source: "old" }, { utm_source: "new" })).toEqual({ utm_source: "new" });
  });
  it("next 為 direct（無 touch）→ 保留 prev", () => {
    expect(mergeLastTouch({ utm_source: "old" }, {})).toEqual({ utm_source: "old" });
  });
  it("prev 為 null 且 next direct → null", () => {
    expect(mergeLastTouch(null, {})).toBeNull();
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run lib/attribution.test.js`
Expected: FAIL（模組未建立）。

- [ ] **Step 3: 實作**

Create `lib/attribution.js`:

```js
// lib/attribution.js — UTM 歸因（last-touch）。純函式可測 + browser cookie helpers。
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
const CLICK_KEYS = ["gclid", "fbclid"];
const COOKIE_NAME = "ir_attr";
const COOKIE_DAYS = 30;

export function parseAttribution(search) {
  const p = typeof search === "string" ? new URLSearchParams(search) : search;
  const out = {};
  for (const k of [...UTM_KEYS, ...CLICK_KEYS]) {
    const v = p.get(k);
    if (v) out[k] = v;
  }
  return out;
}

export function hasTouch(attr) {
  return !!attr && Object.keys(attr).some((k) => attr[k]);
}

export function mergeLastTouch(prev, next) {
  if (hasTouch(next)) return { ...next };
  return prev || null;
}

export function readAttributionCookie() {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|; )ir_attr=([^;]*)/);
  if (!m) return null;
  try {
    return JSON.parse(decodeURIComponent(m[1]));
  } catch {
    return null;
  }
}

function writeAttributionCookie(obj) {
  const val = encodeURIComponent(JSON.stringify(obj));
  const maxAge = COOKIE_DAYS * 86400;
  document.cookie = `${COOKIE_NAME}=${val}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

// 落地擷取：本次帶 UTM/click id 才覆蓋（last-touch）；direct 保留既有
export function captureAttribution() {
  if (typeof window === "undefined") return null;
  const parsed = parseAttribution(window.location.search);
  const prev = readAttributionCookie();
  if (!hasTouch(parsed)) return prev;
  const next = {
    ...parsed,
    landing_path: window.location.pathname,
    referrer: document.referrer || "",
    captured_at: new Date().toISOString(),
  };
  writeAttributionCookie(next);
  return next;
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run lib/attribution.test.js`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add lib/attribution.js lib/attribution.test.js
git commit -m "feat(tracking): UTM last-touch attribution parsing and cookie capture"
```

---

## Task 4: lib/attribution-report.js（後臺來源分組）

**Files:**
- Create: `lib/attribution-report.js`
- Test: `lib/attribution-report.test.js`

**Interfaces:**
- Consumes: 訂單陣列，每筆需 `{ amount:number, attribution:object|null }`（傳入前已篩選為已付款訂單）。
- Produces: `groupBySource(orders) -> Array<{ source:string, orders:number, revenue:number }>`（依 revenue 由大到小；無 attribution 歸「直接／自然」）。

- [ ] **Step 1: 寫失敗測試**

Create `lib/attribution-report.test.js`:

```js
import { describe, it, expect } from "vitest";
import { groupBySource } from "./attribution-report.js";

describe("groupBySource", () => {
  it("依 source/campaign 分組並加總營收，無歸因歸直接", () => {
    const rows = groupBySource([
      { amount: 5800, attribution: { utm_source: "facebook", utm_campaign: "summer" } },
      { amount: 5800, attribution: { utm_source: "facebook", utm_campaign: "summer" } },
      { amount: 4299, attribution: { utm_source: "google" } },
      { amount: 6800, attribution: null },
    ]);
    expect(rows[0]).toEqual({ source: "facebook / summer", orders: 2, revenue: 11600 });
    const direct = rows.find((r) => r.source === "直接／自然");
    expect(direct).toEqual({ source: "直接／自然", orders: 1, revenue: 6800 });
  });
  it("空陣列回空", () => expect(groupBySource([])).toEqual([]));
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run lib/attribution-report.test.js`
Expected: FAIL。

- [ ] **Step 3: 實作**

Create `lib/attribution-report.js`:

```js
// lib/attribution-report.js — 後臺來源歸因聚合（純函式）
export function groupBySource(orders) {
  const map = new Map();
  for (const o of orders || []) {
    const a = o.attribution || null;
    const key = a?.utm_source
      ? `${a.utm_source}${a.utm_campaign ? " / " + a.utm_campaign : ""}`
      : "直接／自然";
    const cur = map.get(key) || { source: key, orders: 0, revenue: 0 };
    cur.orders += 1;
    cur.revenue += Number(o.amount) || 0;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run lib/attribution-report.test.js`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add lib/attribution-report.js lib/attribution-report.test.js
git commit -m "feat(tracking): attribution report grouping by source/campaign"
```

---

## Task 5: lib/track-event.js（前台事件分派）

**Files:**
- Create: `lib/track-event.js`
- Test: `lib/track-event.test.js`

**Interfaces:**
- Produces:
  - `trackEvent(name, params?)` — `name ∈ 'PageView'|'ViewContent'|'InitiateCheckout'|'Purchase'`；`params: { value?, currency?, contentIds?:string[], contentName?, transactionId? }`。分派 Meta `fbq('track',name,...)` 與 GA4 `gtag('event',mapped,...)`。
  - `trackGoogleAdsConversion({ sendTo, value, currency, transactionId })`
  - `trackLineConversion(tagId)`
  - 全部在 `window.fbq/gtag/_lt` 未定義時安全略過（不丟錯）。

- [ ] **Step 1: 寫失敗測試**

Create `lib/track-event.test.js`:

```js
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { trackEvent, trackGoogleAdsConversion } from "./track-event.js";

beforeEach(() => {
  window.fbq = vi.fn();
  window.gtag = vi.fn();
});

describe("trackEvent", () => {
  it("Purchase 同時打 Meta 與 GA4，帶正確參數", () => {
    trackEvent("Purchase", { value: 5800, currency: "TWD", contentIds: ["bundle"], transactionId: "T1" });
    expect(window.fbq).toHaveBeenCalledWith("track", "Purchase", {
      value: 5800, currency: "TWD", content_ids: ["bundle"], content_type: "product",
    });
    expect(window.gtag).toHaveBeenCalledWith("event", "purchase", {
      currency: "TWD", value: 5800, transaction_id: "T1", items: [{ item_id: "bundle", item_name: undefined }],
    });
  });
  it("InitiateCheckout 映射 GA4 begin_checkout", () => {
    trackEvent("InitiateCheckout", { value: 4299, currency: "TWD", contentIds: ["bundle"] });
    expect(window.gtag).toHaveBeenCalledWith("event", "begin_checkout", expect.objectContaining({ value: 4299 }));
  });
  it("globals 未定義不丟錯", () => {
    delete window.fbq; delete window.gtag;
    expect(() => trackEvent("PageView")).not.toThrow();
  });
});

describe("trackGoogleAdsConversion", () => {
  it("打 gtag conversion 帶 send_to", () => {
    trackGoogleAdsConversion({ sendTo: "AW-1/lab", value: 5800, currency: "TWD", transactionId: "T1" });
    expect(window.gtag).toHaveBeenCalledWith("event", "conversion", {
      send_to: "AW-1/lab", value: 5800, currency: "TWD", transaction_id: "T1",
    });
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run lib/track-event.test.js`
Expected: FAIL。

- [ ] **Step 3: 實作**

Create `lib/track-event.js`:

```js
// lib/track-event.js — 前台事件分派（client）。Meta + GA4 通用事件；Google Ads/LINE 轉換另呼叫。
const GA4_MAP = { PageView: "page_view", ViewContent: "view_item", InitiateCheckout: "begin_checkout", Purchase: "purchase" };

function metaParams(name, p) {
  const out = {};
  if (p.value != null) out.value = p.value;
  if (p.currency) out.currency = p.currency;
  if (p.contentIds) out.content_ids = p.contentIds;
  if (p.contentName) out.content_name = p.contentName;
  if (name === "ViewContent" || name === "Purchase") out.content_type = "product";
  return out;
}

function ga4Params(name, p) {
  const out = {};
  if (p.currency) out.currency = p.currency;
  if (p.value != null) out.value = p.value;
  if (name === "Purchase" && p.transactionId) out.transaction_id = p.transactionId;
  if (p.contentIds || p.contentName) out.items = [{ item_id: p.contentIds?.[0], item_name: p.contentName }];
  return out;
}

export function trackEvent(name, params = {}) {
  if (typeof window === "undefined") return;
  if (typeof window.fbq === "function") window.fbq("track", name, metaParams(name, params));
  if (typeof window.gtag === "function") window.gtag("event", GA4_MAP[name] || name, ga4Params(name, params));
}

export function trackGoogleAdsConversion({ sendTo, value, currency, transactionId } = {}) {
  if (typeof window === "undefined" || typeof window.gtag !== "function" || !sendTo) return;
  window.gtag("event", "conversion", { send_to: sendTo, value, currency, transaction_id: transactionId });
}

export function trackLineConversion(tagId) {
  if (typeof window === "undefined" || typeof window._lt !== "function" || !tagId) return;
  window._lt("send", "cv", [tagId]);
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run lib/track-event.test.js`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add lib/track-event.js lib/track-event.test.js
git commit -m "feat(tracking): client event dispatch for Meta/GA4/Ads/LINE"
```

---

## Task 6: 注入層 — TrackingScripts + RouteChangeTracker + 掛進 layout

**Files:**
- Create: `components/tracking/TrackingScripts.jsx`, `components/tracking/RouteChangeTracker.jsx`
- Modify: `app/layout.jsx`

**Interfaces:**
- Consumes: `getTrackingSettings()`（Task 2）、`captureAttribution`（Task 3）、`trackEvent`（Task 5）、`metaSnippet/googleConfigSnippet/lineSnippet`（Task 2）。
- Produces: root layout 依已啟用平台注入 base script；SPA 換頁補打 PageView + LINE pv 並擷取 UTM。

- [ ] **Step 1: TrackingScripts.jsx（server）**

Create `components/tracking/TrackingScripts.jsx`:

```jsx
import Script from "next/script";
import { metaSnippet, googleConfigSnippet, lineSnippet } from "@/lib/tracking";

// platforms = getTrackingSettings() 的輸出（enabledPlatforms）
export default function TrackingScripts({ platforms }) {
  const { meta, ga4, googleAds, line } = platforms || {};
  const googleLoaderId = ga4?.id || googleAds?.id;
  return (
    <>
      {meta?.id && (
        <Script id="meta-pixel" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: metaSnippet(meta.id) }} />
      )}
      {googleLoaderId && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${googleLoaderId}`} strategy="afterInteractive" />
          <Script id="google-gtag" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: googleConfigSnippet({ ga4Id: ga4?.id, adsId: googleAds?.id }) }} />
        </>
      )}
      {line?.id && (
        <Script id="line-tag" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: lineSnippet(line.id) }} />
      )}
    </>
  );
}
```

- [ ] **Step 2: RouteChangeTracker.jsx（client）**

Create `components/tracking/RouteChangeTracker.jsx`:

```jsx
"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { captureAttribution } from "@/lib/attribution";
import { trackEvent } from "@/lib/track-event";

// 首次載入由各 base snippet 自行送 PageView；此元件負責 SPA 換頁補送，並每次擷取 UTM
export default function RouteChangeTracker({ lineTagId }) {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    captureAttribution();
    if (first.current) {
      first.current = false;
      return; // 初次不重複送 PageView
    }
    trackEvent("PageView");
    if (lineTagId && typeof window._lt === "function") window._lt("send", "pv", [lineTagId]);
  }, [pathname, lineTagId]);
  return null;
}
```

- [ ] **Step 3: 掛進 layout.jsx**

Modify `app/layout.jsx`：加匯入、把 `RootLayout` 改為 `async`、讀設定、在 `<body>` 最前面注入。

匯入區加：
```jsx
import TrackingScripts from "@/components/tracking/TrackingScripts";
import RouteChangeTracker from "@/components/tracking/RouteChangeTracker";
import { getTrackingSettings } from "@/lib/tracking";
```

把預設匯出改為：
```jsx
export default async function RootLayout({ children }) {
  const platforms = await getTrackingSettings();
  return (
    <html lang="zh-Hant" className={`${cormorant.variable} ${notoSerif.variable} ${inter.variable} ${notoSans.variable} ${jetbrains.variable}`}>
      <body>
        <TrackingScripts platforms={platforms} />
        <RouteChangeTracker lineTagId={platforms?.line?.id || null} />
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 4: 手動驗證注入**

先塞一個測試 Meta id（用 SQL Editor）：
```sql
update tracking_settings set config =
  '{"meta":{"id":"1234567890","enabled":true}}'::jsonb where id='default';
```
再跑 `npm run build && npm run start`（或 dev），開首頁 →
- View Source / DevTools 應見 `fbevents.js` 與 `fbq('init','1234567890')`。
- 裝 Meta Pixel Helper 應偵測到 Pixel 與初次 PageView。
- 站內點連結換頁 → Pixel Helper 應再記一次 PageView（RouteChangeTracker 生效）。

驗證完把測試值清掉：
```sql
update tracking_settings set config = '{}'::jsonb where id='default';
```

- [ ] **Step 5: Commit**

```bash
git add components/tracking/TrackingScripts.jsx components/tracking/RouteChangeTracker.jsx app/layout.jsx
git commit -m "feat(tracking): inject pixel base scripts and SPA route-change tracking"
```

---

## Task 7: Purchase 事件（PurchaseTracking + /success 回查訂單）

**Files:**
- Create: `components/tracking/PurchaseTracking.jsx`
- Modify: `app/success/page.jsx`

**Interfaces:**
- Consumes: `trackEvent/trackGoogleAdsConversion/trackLineConversion`（Task 5）、`getTrackingSettings`（Task 2）、`getSupabaseAdmin`。訂單欄位 `amount / plan / status`，查詢鍵 `mer_trade_no`。
- Produces: `/success` 成功時打一次 Purchase（Meta + GA4 + Google Ads 轉換 + LINE cv），以 `localStorage` 去重。

- [ ] **Step 1: PurchaseTracking.jsx（client）**

Create `components/tracking/PurchaseTracking.jsx`:

```jsx
"use client";
import { useEffect } from "react";
import { trackEvent, trackGoogleAdsConversion, trackLineConversion } from "@/lib/track-event";

export default function PurchaseTracking({ transactionId, value, currency = "TWD", contentIds, googleAdsSendTo, lineTagId }) {
  useEffect(() => {
    if (!transactionId || value == null) return;
    const key = `ir_purchase_fired:${transactionId}`;
    try { if (localStorage.getItem(key)) return; } catch {}
    trackEvent("Purchase", { value, currency, contentIds, transactionId });
    if (googleAdsSendTo) trackGoogleAdsConversion({ sendTo: googleAdsSendTo, value, currency, transactionId });
    if (lineTagId) trackLineConversion(lineTagId);
    try { localStorage.setItem(key, "1"); } catch {}
  }, [transactionId, value, currency, contentIds, googleAdsSendTo, lineTagId]);
  return null;
}
```

- [ ] **Step 2: /success 回查訂單並渲染**

Modify `app/success/page.jsx`：匯入區加：
```jsx
import { getSupabaseAdmin } from "@/lib/supabase";
import { getTrackingSettings } from "@/lib/tracking";
import PurchaseTracking from "@/components/tracking/PurchaseTracking";
```

在 `SuccessPage` 內、`if (failed)` 分支之前，加入 best-effort 回查（失敗不影響頁面）：
```jsx
  let purchase = null;
  if (tradeNo && !failed) {
    try {
      const sb = getSupabaseAdmin();
      const { data: order } = sb
        ? await sb.from("orders").select("amount, plan, status").eq("mer_trade_no", tradeNo).maybeSingle()
        : { data: null };
      if (order && order.status !== "refunded") {
        const platforms = await getTrackingSettings();
        purchase = {
          transactionId: tradeNo,
          value: Number(order.amount) || 0,
          contentIds: [order.plan],
          googleAdsSendTo: platforms?.googleAds ? `${platforms.googleAds.id}/${platforms.googleAds.purchaseLabel}` : null,
          lineTagId: platforms?.line?.id || null,
        };
      }
    } catch {}
  }
```

在成功分支的 JSX（`return (` 內、`<div style={card}>` 內任意位置）加：
```jsx
          {purchase && purchase.value > 0 && <PurchaseTracking {...purchase} />}
```

- [ ] **Step 3: 手動驗證**

塞測試 Meta id（同 Task 6 SQL），跑站，走一筆結帳到 `/success?MerTradeNo=<真實訂單編號>`：
- Meta Pixel Helper 應記到 `Purchase`，`value` = 訂單金額、`currency=TWD`。
- 重整 `/success` 同一 `MerTradeNo` → **不應**再記一次（localStorage 去重）。
- GA4 DebugView 應見 `purchase` 事件帶 `transaction_id`。
驗證後清掉測試 config。

- [ ] **Step 4: Commit**

```bash
git add components/tracking/PurchaseTracking.jsx app/success/page.jsx
git commit -m "feat(tracking): fire Purchase conversion on success page with dedupe"
```

---

## Task 8: 歸因寫入訂單（BuyModal → checkout body → 資料欄）

**Files:**
- Modify: `components/BuyModal.jsx`, `app/api/payuni/checkout/route.js`

**Interfaces:**
- Consumes: `readAttributionCookie`（Task 3）。
- Produces: checkout 請求 body 多帶 `attribution`；`app/api/payuni/checkout/route.js` 建單時寫入 `orders.attribution`。

- [ ] **Step 1: BuyModal 帶 attribution**

Modify `components/BuyModal.jsx`：頂部匯入加：
```jsx
import { readAttributionCookie } from "@/lib/attribution";
```

找到送出 checkout 的 `fetch("/api/payuni/checkout", …)`（約 `:239`），在其 `body` 物件加入 `attribution`：
```jsx
        body: JSON.stringify({ plan: plan.plan, price: basePrice, label: plan.label, email, couponCode: couponApplied?.code || undefined, proofUrl: proofUrl || undefined, attribution: readAttributionCookie() || undefined, ...invoiceFields }),
```

- [ ] **Step 2: checkout route 寫入欄位**

Modify `app/api/payuni/checkout/route.js`：從 body 取出 `attribution`（與現有 `const { plan, email, proofUrl } = body;` 併行；可直接 `const attribution = body.attribution || null;`），並在建立訂單的 insert 物件（含 `plan / plan_label / amount / mer_trade_no` 那組，約 `:156`）加一行：
```js
        attribution,
```

- [ ] **Step 3: 手動驗證**

帶 UTM 落地：開 `http://localhost:3000/?utm_source=fb&utm_campaign=test`，走結帳建立一筆訂單，於 SQL Editor：
```sql
select mer_trade_no, amount, attribution from orders order by created_at desc limit 1;
```
Expected: `attribution` = `{"utm_source":"fb","utm_campaign":"test","landing_path":"/","referrer":"...","captured_at":"..."}`。

再測 direct（不帶 UTM 但先前 cookie 有值）→ 應沿用上一次來源（last-touch 不覆蓋）。

- [ ] **Step 4: Commit**

```bash
git add components/BuyModal.jsx app/api/payuni/checkout/route.js
git commit -m "feat(tracking): persist last-touch attribution onto orders at checkout"
```

---

## Task 9: 漏斗事件（InitiateCheckout + ViewContent）

**Files:**
- Modify: `components/BuyModal.jsx`, `app/HomeClient.jsx`

**Interfaces:**
- Consumes: `trackEvent`（Task 5）。
- Produces: BuyModal `open` 轉真時打 `InitiateCheckout`；`#pricing` 進入視窗打一次 `ViewContent`。

- [ ] **Step 1: BuyModal 開啟打 InitiateCheckout**

Modify `components/BuyModal.jsx`：頂部匯入加 `import { trackEvent } from "@/lib/track-event";`（`useEffect` 若未匯入則從 react 補上）。BuyModal 為常駐、以 `open` prop 控制顯示（見 `HomeClient.jsx:948` 的 `<BuyModal open={buyOpen} … />`），故用 `open` 轉真觸發：
```jsx
  useEffect(() => {
    if (open) trackEvent("InitiateCheckout", { value: basePrice, currency: "TWD", contentIds: [plan?.plan] });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
```
> `basePrice` 與 `plan` 為 BuyModal 既有變數/prop（見結帳 `:242` 用到的 `basePrice`、`plan.plan`）。

- [ ] **Step 2: HomeClient 對 #pricing 掛進場觀察**

Modify `app/HomeClient.jsx`：頂部匯入加 `import { trackEvent } from "@/lib/track-event";`（`useEffect` 已匯入）。在 HomeClient 元件主體加一個初次掛載執行的 effect（`sale` 為既有 state，於元件內在 scope）：
```jsx
  useEffect(() => {
    const el = document.getElementById("pricing");
    if (!el) return;
    let fired = false;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && !fired) {
          fired = true;
          trackEvent("ViewContent", { contentIds: ["bundle"], contentName: "學琴全攻略（課程包）", value: sale?.plans?.bundle?.current, currency: "TWD" });
          io.disconnect();
        }
      }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
```
> `#pricing` 即 `app/HomeClient.jsx:804` 的 `<RevealSection id="pricing">`。`value` 取 `sale.plans.bundle` 的現價欄位（依該物件實際結構，如 `.current`；取不到為 `undefined`，ViewContent 不帶 value 仍有效）。用觀察 `#pricing` 而非包一層 div，避免動到 `styles.pricingSection` 版面與 reveal 動畫。

- [ ] **Step 3: 手動驗證**

塞測試 Meta id，跑站：
- 滾到定價區 → Pixel Helper 記一次 `ViewContent`（不重複）。
- 點「立即購買」開視窗 → Pixel Helper 記 `InitiateCheckout`。
清掉測試 config。

- [ ] **Step 4: Commit**

```bash
git add components/BuyModal.jsx app/HomeClient.jsx
git commit -m "feat(tracking): ViewContent on pricing view and InitiateCheckout on modal open"
```

---

## Task 10: 後臺 API — tracking-settings（GET/PATCH）

**Files:**
- Create: `app/api/admin/tracking-settings/route.js`

**Interfaces:**
- Consumes: `verifyAdminToken`、`getSupabaseAdmin`、`sanitizeTrackingConfig`（Task 2）、`logAudit`、`revalidateTag`。
- Produces: `GET` 回目前 raw config；`PATCH` 驗證→upsert→`revalidateTag("tracking-settings")`→記 audit。

- [ ] **Step 1: 實作 route**

Create `app/api/admin/tracking-settings/route.js`:

```js
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { sanitizeTrackingConfig } from "@/lib/tracking";
import { logAudit } from "@/lib/audit";

export async function GET(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const { data, error } = await sb.from("tracking_settings").select("config").eq("id", "default").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data?.config || {} });
}

export async function PATCH(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const body = await req.json();
  const r = sanitizeTrackingConfig(body.config || body);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });

  const { data, error } = await sb.from("tracking_settings")
    .upsert({ id: "default", config: r.config, updated_at: new Date().toISOString() }, { onConflict: "id" })
    .select("config").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidateTag("tracking-settings");
  await logAudit(sb, { actor: payload.email, action: "tracking_settings.update", targetType: "tracking_settings", targetId: "default", meta: r.config, req });
  return NextResponse.json({ data: data.config });
}
```

- [ ] **Step 2: 手動驗證（用後臺 token）**

在後臺登入後，DevTools Console 取 `sessionStorage.getItem("inrecord_admin_token")`，用它測：
```bash
# GET（帶 <TOKEN>）
curl -s http://localhost:3000/api/admin/tracking-settings -H "Authorization: Bearer <TOKEN>"
# PATCH（設一個 meta id）
curl -s -X PATCH http://localhost:3000/api/admin/tracking-settings \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"config":{"meta":{"id":"123","enabled":true}}}'
```
Expected: GET 回 `{data:{}}`（初始）；PATCH 回 `{data:{meta:{id:"123",enabled:true}, ga4:..., google_ads:..., line:...}}`；未帶 token 回 401；`{"config":{"meta":{"id":"","enabled":true}}}` 回 400 `meta_id_required`。

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/tracking-settings/route.js
git commit -m "feat(tracking): admin API to read/update tracking settings"
```

---

## Task 11: 後臺 UI — 追蹤碼分頁 + 導覽

**Files:**
- Create: `app/admin/TrackingSettingsPage.jsx`
- Modify: `app/admin/page.jsx`

**Interfaces:**
- Consumes: `/api/admin/tracking-settings`（Task 10）；token 取用比照 `SaleSettingsPage`。
- Produces: 「設定」群組新增「追蹤碼」分頁，四平台卡（ID + 啟用開關；Google Ads 另有轉換標籤），儲存即時生效。

- [ ] **Step 1: TrackingSettingsPage.jsx**

Create `app/admin/TrackingSettingsPage.jsx`:

```jsx
"use client";
import { useEffect, useState } from "react";

const pw = () => (typeof window !== "undefined" ? sessionStorage.getItem("inrecord_admin_token") : "");
async function adminFetch(path, opts = {}) {
  return fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${pw()}`, ...(opts.headers || {}) } });
}

const EMPTY = {
  meta: { id: "", enabled: false },
  ga4: { id: "", enabled: false },
  google_ads: { id: "", purchase_label: "", enabled: false },
  line: { id: "", enabled: false },
};

const CARDS = [
  { key: "meta", title: "Meta / Facebook Pixel", hint: "事件管理員 → 資料來源 → 你的 Pixel → Pixel ID（純數字）", idLabel: "Pixel ID" },
  { key: "ga4", title: "Google Analytics 4", hint: "GA4 管理 → 資料串流 → 評估 ID，格式 G-XXXXXXX", idLabel: "評估 ID (G-)" },
  { key: "google_ads", title: "Google Ads", hint: "Google Ads → 目標 → 轉換 → 代碼設定，AW-XXXXXXX 與轉換標籤", idLabel: "轉換 ID (AW-)" },
  { key: "line", title: "LINE Tag", hint: "LINE 官方帳號 / LINE Ads → LINE Tag ID", idLabel: "Tag ID" },
];

export default function TrackingSettingsPage({ showToast }) {
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminFetch("/api/admin/tracking-settings")
      .then((r) => r.json())
      .then((d) => setC({ ...EMPTY, ...(d.data || {}) }))
      .catch(() => { setC(EMPTY); showToast?.("載入追蹤碼設定失敗，顯示空白表單"); })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line

  if (loading || !c) return <div style={{ padding: 24 }}>載入中…</div>;

  const set = (key, field, val) => setC((prev) => ({ ...prev, [key]: { ...prev[key], [field]: val } }));

  async function save() {
    setSaving(true);
    try {
      const r = await adminFetch("/api/admin/tracking-settings", { method: "PATCH", body: JSON.stringify({ config: c }) });
      const d = await r.json();
      if (!r.ok) { showToast?.("儲存失敗：" + (d.error || r.status)); return; }
      setC({ ...EMPTY, ...(d.data || {}) });
      showToast?.("✅ 追蹤碼已儲存，前台即時生效");
    } catch {
      showToast?.("儲存失敗，請稍後再試");
    } finally {
      setSaving(false);
    }
  }

  const wrap = { maxWidth: 720, padding: 24, display: "grid", gap: 16 };
  const card = { border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, background: "#fff", wordBreak: "keep-all", lineBreak: "strict" };
  const label = { fontSize: 13, color: "#64748b", marginBottom: 4 };
  const input = { width: "100%", padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 14 };

  return (
    <div style={wrap}>
      <h2 style={{ fontSize: 20, fontWeight: 800 }}>追蹤碼中心</h2>
      <p style={{ fontSize: 13, color: "#64748b" }}>貼上各平台 ID 並開啟即生效（免重新部署）。留空或關閉則不注入。投放廣告時 campaign 命名建議與 UTM 一致，Phase 2 才能對接花費算 ROAS。</p>
      {CARDS.map(({ key, title, hint, idLabel }) => (
        <div key={key} style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <strong>{title}</strong>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={!!c[key].enabled} onChange={(e) => set(key, "enabled", e.target.checked)} /> 啟用
            </label>
          </div>
          <div style={label}>{idLabel}</div>
          <input style={input} value={c[key].id} onChange={(e) => set(key, "id", e.target.value)} placeholder={idLabel} />
          {key === "google_ads" && (
            <div style={{ marginTop: 8 }}>
              <div style={label}>購買轉換標籤 (label)</div>
              <input style={input} value={c.google_ads.purchase_label} onChange={(e) => set("google_ads", "purchase_label", e.target.value)} placeholder="轉換動作的 label" />
            </div>
          )}
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>{hint}</div>
        </div>
      ))}
      <button onClick={save} disabled={saving} style={{ justifySelf: "start", background: "#2563eb", color: "#fff", fontWeight: 700, padding: "10px 20px", borderRadius: 10, border: 0, cursor: "pointer" }}>
        {saving ? "儲存中…" : "儲存"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: 掛進 admin 導覽與渲染**

Modify `app/admin/page.jsx`：
1. 匯入：`import TrackingSettingsPage from "./TrackingSettingsPage";`，並在 lucide 匯入清單加 `Activity`。
2. `NAV_GROUPS`「設定」群組 items 內、`sale` 後加：
```jsx
    { id:"tracking",   label:"追蹤碼",   icon: Activity },
```
3. 找到渲染分頁那段（如 `{page==="sale" && <SaleSettingsPage showToast={showToast}/>}`）旁加：
```jsx
          {page==="tracking"    && <TrackingSettingsPage showToast={showToast}/>}
```

- [ ] **Step 3: 手動驗證**

登入後臺 → 設定 → 追蹤碼：填 Meta id + 啟用 → 儲存 → 顯示成功；重整頁面值仍在；開首頁 View Source 應見該 Pixel 已注入（`revalidateTag` 已使 layout 快取失效）。關閉 → 儲存 → 首頁不再注入。

- [ ] **Step 4: Commit**

```bash
git add app/admin/TrackingSettingsPage.jsx app/admin/page.jsx
git commit -m "feat(tracking): admin tracking-settings page and nav entry"
```

---

## Task 12: 後臺來源歸因表（掛進銷售分析）

**Files:**
- Create: `components/admin/SourceAttributionTable.jsx`
- Modify: `app/admin/page.jsx`

**Interfaces:**
- Consumes: `groupBySource`（Task 4）；後臺分析頁既有的已付款訂單陣列（每筆含 `amount`、`attribution`）。
- Produces: 銷售分析區塊顯示各來源訂單數與營收。

- [ ] **Step 1: SourceAttributionTable.jsx**

Create `components/admin/SourceAttributionTable.jsx`:

```jsx
"use client";
import { groupBySource } from "@/lib/attribution-report";

export default function SourceAttributionTable({ orders }) {
  const rows = groupBySource(orders || []);
  const th = { textAlign: "left", padding: "8px 10px", fontSize: 12, color: "#64748b", borderBottom: "1px solid #e2e8f0" };
  const td = { padding: "8px 10px", fontSize: 14, borderBottom: "1px solid #f1f5f9" };
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, marginTop: 16, wordBreak: "keep-all", lineBreak: "strict" }}>
      <strong style={{ fontSize: 15 }}>廣告來源歸因（依訂單 UTM）</strong>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
        <thead><tr><th style={th}>來源 / 活動</th><th style={th}>訂單數</th><th style={th}>營收</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td style={td} colSpan={3}>尚無資料</td></tr>}
          {rows.map((r) => (
            <tr key={r.source}>
              <td style={td}>{r.source}</td>
              <td style={td}>{r.orders}</td>
              <td style={td}>${r.revenue.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>營收為訂單金額加總；Phase 2 接廣告花費後即可對接算 ROAS。</div>
    </div>
  );
}
```

- [ ] **Step 2: 掛進銷售分析頁**

Modify `app/admin/page.jsx`：匯入 `import SourceAttributionTable from "@/components/admin/SourceAttributionTable";`。渲染「銷售分析」（`analytics`）分頁的圖表元件內已有 `const paidOrders=orders.filter(o=>o.status==="paid")`（見 `app/admin/page.jsx:159`），在其圖表 JSX 尾端插入：
```jsx
              <SourceAttributionTable orders={paidOrders} />
```
> 不新增 API 請求，沿用既有 `paidOrders`。若 `:159` 的 `paidOrders` 屬儀表板而非 analytics 分頁元件，則於 `page==="analytics"` 對應元件內以 `orders.filter(o=>o.status==="paid")` 傳入。

- [ ] **Step 3: 手動驗證**

先確保有帶 UTM 的訂單（Task 8 建的），進後臺 → 銷售分析 → 應見「廣告來源歸因」表，`fb / test` 一列、直接／自然一列，營收正確。

- [ ] **Step 4: Commit**

```bash
git add components/admin/SourceAttributionTable.jsx app/admin/page.jsx
git commit -m "feat(tracking): source attribution table in sales analytics"
```

---

## Task 13: 隱私權政策揭露

**Files:**
- Modify: `app/privacy/page.jsx`

**Interfaces:**
- Produces: 隱私頁新增一段追蹤揭露文字（Meta/Google/LINE + 退出方式）。

- [ ] **Step 1: 加入揭露段落**

Modify `app/privacy/page.jsx`：在既有內容中適當位置（如「Cookie／第三方服務」相關段落）加入一段（依該頁既有標題/段落樣式呈現）：

> **廣告與分析追蹤**
> 本網站使用 Meta Pixel、Google（Google Analytics 4、Google Ads）與 LINE Tag 等第三方追蹤技術，透過 Cookie 蒐集匿名的瀏覽與轉換資料，用於衡量廣告成效與再行銷。你可透過以下方式停用：
> - Meta：帳號設定 → 廣告偏好；或安裝 Meta Pixel 相關瀏覽器封鎖工具
> - Google：造訪「我的廣告中心」或安裝 Google Analytics 停用外掛（tools.google.com/dlpage/gaoptout）
> - LINE：LINE 應用程式設定 → 隱私設定 → 提供使用資料
> 你也可於瀏覽器設定封鎖第三方 Cookie。停用後仍可正常使用本網站，但我們將無法據以衡量廣告成效。

實作時比照該頁既有 JSX 結構（標題元素 + 段落）落地，套用 `word-break: keep-all` 慣例。

- [ ] **Step 2: 手動驗證**

開 `/privacy` → 應見「廣告與分析追蹤」段落，文字正常斷行、連結可點。

- [ ] **Step 3: Commit**

```bash
git add app/privacy/page.jsx
git commit -m "docs(privacy): disclose Meta/Google/LINE tracking and opt-out"
```

---

## 收尾驗證（全部任務後）

- [ ] `npm test` 全綠（tracking / attribution / attribution-report / track-event）。
- [ ] `npm run build` 成功（layout async + next/script 無錯）。
- [ ] 後臺追蹤碼填入真實 Meta/GA4/Google Ads/LINE ID 並啟用 → 首頁四平台 base 皆注入；Pixel Helper / GA4 DebugView / Tag Assistant 綠燈。
- [ ] 走一筆真結帳 → `/success` 記到 Purchase（金額正確、重整不重複）→ 訂單 `attribution` 有值 → 後臺來源歸因表出現該筆。
- [ ] `/privacy` 揭露段落到位。

## 部署

```bash
git rev-parse --abbrev-ref HEAD           # 確認分支
gh auth switch --user inrecmusic          # 切正確 GitHub 帳號
git push
npx vercel --prod                          # InRecord 未接自動部署，手動出正式站
```
> SQL（Task 1）需先在正式 DB（`vmslzbcegfljlopkewpx`）跑過，否則注入讀 `tracking_settings` 會取不到而全部關閉。
