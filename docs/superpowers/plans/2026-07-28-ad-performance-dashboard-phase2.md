# 廣告成效儀錶板（Phase 2 · Meta）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 後臺「廣告成效」分頁：每日 cron 撈 Meta 廣告 insights 進 `ad_insights`，與真實訂單以 UTM 對接算真 ROAS，顯示 KPI／賺賠散點／花費分配／漏斗／明細。**全程 guarded on token**：未設 Meta env 時 cron no-op、儀錶板顯示空狀態；設好就自動亮，零重做。

**Architecture:** 純分析邏輯（ROAS join、所有衍生指標、圖表資料）集中 `lib/ad-report.js` 可測；Meta API 取數 `lib/meta-ads.js`（guarded）；每日 cron 同步；admin API 回報表或空；`AdsPerformancePage.jsx` 照核准 mockup 呈現。

**Tech Stack:** Next.js 14.2.35、Supabase（`getSupabaseAdmin`）、Meta Graph API v25.0、Vercel Cron（每日；Hobby 限制）、Vitest。

**設計依據（UI）：** 核准的視覺示意稿 `/private/tmp/claude-501/-Users-zhoubolong/5af26749-b601-4b5f-996f-1ac279935856/scratchpad/ad-performance-dashboard.html` —— 版面、圖表、色彩、SVG 生成邏輯以此為準 port。相關設計 spec：`docs/superpowers/specs/2026-07-26-ad-tracking-phase2-meta-insights-design.md`（本計畫在其上加：CPA/CVR/頻率/Meta-vs-真對比、散點/分配條/漏斗/sparkline/最佳最差、guarded/空狀態）。

## Global Constraints

- **Guarded on token（最重要）**：`META_ADS_ACCESS_TOKEN` 或 `META_AD_ACCOUNT_ID` 任一未設 → cron `sync` 直接 no-op 回 `{skipped:"not_configured"}`；儀錶板 `ad_insights` 空 → 顯示空狀態（「尚未有數據，設定 Meta 並投放後每日自動同步」）。**任何情況都不得讓站台或後臺壞掉。**
- **Meta API**：`https://graph.facebook.com/${META_API_VERSION||'v25.0'}/act_<id>/insights`；`level=campaign`、`time_increment=1`、`time_range={since,until}`；**回傳數值欄位為字串 → 一律 `Number()` 轉換**；分頁走 `paging.next`（完整 URL）迴圈；`json.error` 存在則丟出（帶 code/message）。購買轉換從 `actions`/`action_values` 陣列取 `action_type ∈ {purchase, offsite_conversion.fb_pixel_purchase, omni_purchase}` 加總。
- **ROAS join**：真實營收＝已付款 `orders` 依 `attribution.utm_campaign`（正規化 trim+小寫）對上 `ad_insights.campaign_name`（正規化）加總；未對上的訂單不計入廣告營收。
- **目標 ROAS**：預設 3（`Number(process.env.META_TARGET_ROAS)||3`）；狀態 good≥target、warn 1~target、bad<1。
- **RLS**：`ad_insights` service_role-only（記取 Phase 1 教訓：新公開表無 RLS＝anon 可讀寫）。
- **Cron**：每日（**Vercel Hobby 只能每日**）；Bearer `CRON_SECRET`（比照 release-coupons）。
- **語言/樣式**：繁體中文；後臺 slate＋藍語彙；數據 `tabular-nums`；狀態色（綠/琥珀/紅）一律配數字+位置（勿色彩單獨）。
- **測試**：Vitest node 環境；`npx vitest run <path>`；已知 esbuild/oxc 警告忽略。
- **Git**：分支 `feat/point2-carousel`；只 `git add` 明確路徑（禁 -A）；commit 前確認分支；訊息尾加 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- **部署**：`supabase-ad-insights.sql` 先套正式 DB → push（`gh auth switch --user inrecmusic`）→ `npx vercel --prod`。cron 每日排程。

---

## 檔案結構
**新增**：`supabase-ad-insights.sql`、`lib/ad-report.js`(+test)、`lib/meta-ads.js`(+test)、`app/api/cron/sync-ad-insights/route.js`、`app/api/admin/ad-insights/route.js`、`app/admin/AdsPerformancePage.jsx`
**修改**：`vercel.json`（加每日 cron）、`app/admin/page.jsx`（加「廣告成效」nav + 掛載）

---

## Task 1: 資料庫遷移（ad_insights + RLS）

**Files:** Create: `supabase-ad-insights.sql`

**Interfaces:** Produces `ad_insights`（每 campaign 每日一列，PK 讓同步 idempotent；RLS service_role-only）。

- [ ] **Step 1: 寫 SQL**

Create `supabase-ad-insights.sql`:
```sql
create table if not exists ad_insights (
  platform      text not null default 'meta',
  campaign_id   text not null,
  campaign_name text,
  date          date not null,
  spend         numeric not null default 0,
  impressions   bigint  not null default 0,
  clicks        bigint  not null default 0,
  reach         bigint  not null default 0,
  frequency     numeric not null default 0,
  meta_conversions      numeric not null default 0,
  meta_conversion_value numeric not null default 0,
  currency      text default 'TWD',
  updated_at    timestamptz not null default now(),
  primary key (platform, campaign_id, date)
);
alter table ad_insights enable row level security;
drop policy if exists "service_role_ad_insights" on ad_insights;
create policy "service_role_ad_insights" on ad_insights
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
```

- [ ] **Step 2: 語法驗證**：deploy 階段由 controller 套正式 DB（additive、idempotent）。

- [ ] **Step 3: Commit**
```bash
git rev-parse --abbrev-ref HEAD
git add supabase-ad-insights.sql
git commit -m "feat(ads): add ad_insights table with service_role RLS"
```

---

## Task 2: `lib/ad-report.js`（ROAS join + 衍生指標，純函式）

**Files:** Create: `lib/ad-report.js`; Test: `lib/ad-report.test.js`

**Interfaces:**
- Produces `buildAdReport({ insights, paidOrders, targetRoas = 3 }) -> { totals, campaigns, best, worst, dailySeries, allocation, funnel, configured }`
  - `insights`: `[{campaign_id, campaign_name, date, spend, impressions, clicks, reach, frequency, meta_conversions, meta_conversion_value}]`
  - `paidOrders`: `[{amount, created_at, attribution:{utm_campaign}|null}]`
  - `campaigns[]`: `{campaign_id, campaign_name, spend, impressions, clicks, reach, frequency, ctr, cpc, cpm, cvr, cpa, orders, revenue, metaConversions, metaRoas, trueRoas, status, trend[]}`
  - `totals`: 同上彙總欄
  - `best`/`worst`: `campaigns` 中 spend>0 的 max/min trueRoas（無則 null）
  - `dailySeries`: `[{date, spend, revenue}]`（依日期）
  - `allocation`: `[{campaign_name, spend, pct, status}]`（spend 降冪）
  - `funnel`: `{impressions, clicks, purchases}`

- [ ] **Step 1: 寫失敗測試**

Create `lib/ad-report.test.js`:
```js
import { describe, it, expect } from "vitest";
import { buildAdReport, normKey } from "./ad-report.js";

const insights = [
  { campaign_id: "1", campaign_name: "Brand", date: "2026-07-27", spend: 1200, impressions: 20000, clicks: 800, reach: 9500, frequency: 2.1, meta_conversions: 3, meta_conversion_value: 11997 },
  { campaign_id: "1", campaign_name: "Brand", date: "2026-07-28", spend: 1200, impressions: 18000, clicks: 700, reach: 9000, frequency: 2.0, meta_conversions: 2, meta_conversion_value: 7998 },
  { campaign_id: "2", campaign_name: "Broad", date: "2026-07-28", spend: 4300, impressions: 88000, clicks: 1050, reach: 36700, frequency: 2.4, meta_conversions: 2, meta_conversion_value: 7998 },
];
const orders = [
  { amount: 3999, created_at: "2026-07-27T10:00:00Z", attribution: { utm_campaign: "brand" } },
  { amount: 3999, created_at: "2026-07-28T10:00:00Z", attribution: { utm_campaign: "Brand" } },
  { amount: 3999, created_at: "2026-07-28T11:00:00Z", attribution: { utm_campaign: "BRAND" } },
  { amount: 3999, created_at: "2026-07-28T12:00:00Z", attribution: { utm_campaign: "broad" } },
  { amount: 6800, created_at: "2026-07-28T09:00:00Z", attribution: null }, // 自然流量，不計入廣告
];

describe("buildAdReport", () => {
  const r = buildAdReport({ insights, paidOrders: orders, targetRoas: 3 });
  it("依 utm_campaign 正規化對接營收（大小寫容忍）", () => {
    const brand = r.campaigns.find((c) => c.campaign_id === "1");
    expect(brand.orders).toBe(3);           // 3 筆 brand 訂單
    expect(brand.revenue).toBe(11997);
    expect(brand.spend).toBe(2400);         // 兩日加總
  });
  it("未對上的訂單不計入廣告營收", () => {
    expect(r.totals.orders).toBe(4);        // 排除 attribution=null 那筆
    expect(r.totals.revenue).toBe(15996);
  });
  it("真 ROAS = 營收/花費、CPA = 花費/訂單", () => {
    const broad = r.campaigns.find((c) => c.campaign_id === "2");
    expect(broad.trueRoas).toBeCloseTo(3999 / 4300, 3);
    expect(broad.cpa).toBeCloseTo(4300, 3);
    expect(broad.status).toBe("bad");       // <1
  });
  it("狀態門檻（good≥target / warn / bad）", () => {
    const brand = r.campaigns.find((c) => c.campaign_id === "1");
    expect(brand.trueRoas).toBeCloseTo(11997 / 2400, 3); // 5.0 → good
    expect(brand.status).toBe("good");
  });
  it("best/worst 取 spend>0 的極值", () => {
    expect(r.best.campaign_id).toBe("1");
    expect(r.worst.campaign_id).toBe("2");
  });
  it("dailySeries 依日期加總花費與(對上的)營收", () => {
    const d28 = r.dailySeries.find((d) => d.date === "2026-07-28");
    expect(d28.spend).toBe(1200 + 4300);
    expect(d28.revenue).toBe(3999 * 3);     // 28 日 3 筆廣告訂單
  });
  it("空輸入不炸、configured 反映有無資料", () => {
    const e = buildAdReport({ insights: [], paidOrders: [], targetRoas: 3 });
    expect(e.campaigns).toEqual([]);
    expect(e.configured).toBe(false);
    expect(e.totals.spend).toBe(0);
  });
});

describe("normKey", () => {
  it("正規化 trim+小寫", () => { expect(normKey("  Brand ")).toBe("brand"); expect(normKey(null)).toBe(""); });
});
```

- [ ] **Step 2: 執行確認失敗** — `npx vitest run lib/ad-report.test.js` → FAIL。

- [ ] **Step 3: 實作**

Create `lib/ad-report.js`:
```js
// lib/ad-report.js — 廣告成效：ROAS join + 衍生指標（純函式，可測）
export function normKey(s) { return String(s == null ? "" : s).trim().toLowerCase(); }

const div = (a, b) => (b ? a / b : 0);

export function buildAdReport({ insights = [], paidOrders = [], targetRoas = 3 } = {}) {
  // 訂單依正規化 utm_campaign 分組（僅計有 utm_campaign 的廣告訂單）
  const ordByCamp = new Map();      // normKey -> { orders, revenue }
  const ordByCampDay = new Map();   // normKey|date -> revenue
  const revByDay = new Map();       // date -> revenue（廣告可對上者）
  for (const o of paidOrders) {
    const camp = normKey(o?.attribution?.utm_campaign);
    if (!camp) continue;
    const amt = Number(o.amount) || 0;
    const day = String(o.created_at || "").slice(0, 10);
    const g = ordByCamp.get(camp) || { orders: 0, revenue: 0 };
    g.orders += 1; g.revenue += amt; ordByCamp.set(camp, g);
    ordByCampDay.set(camp + "|" + day, (ordByCampDay.get(camp + "|" + day) || 0) + amt);
    if (day) revByDay.set(day, (revByDay.get(day) || 0) + amt);
  }

  // insights 依 campaign 彙總，並記每日
  const byCamp = new Map();          // campaign_id -> agg
  const spendByDay = new Map();      // date -> spend
  for (const r of insights) {
    const id = String(r.campaign_id);
    const a = byCamp.get(id) || { campaign_id: id, campaign_name: r.campaign_name, spend: 0, impressions: 0, clicks: 0, reach: 0, freqSum: 0, freqN: 0, meta_conversions: 0, meta_conversion_value: 0, days: new Map() };
    a.campaign_name = r.campaign_name || a.campaign_name;
    a.spend += Number(r.spend) || 0;
    a.impressions += Number(r.impressions) || 0;
    a.clicks += Number(r.clicks) || 0;
    a.reach += Number(r.reach) || 0;
    a.freqSum += Number(r.frequency) || 0; a.freqN += 1;
    a.meta_conversions += Number(r.meta_conversions) || 0;
    a.meta_conversion_value += Number(r.meta_conversion_value) || 0;
    const day = String(r.date).slice(0, 10);
    a.days.set(day, (a.days.get(day) || 0) + (Number(r.spend) || 0));
    byCamp.set(id, a);
    spendByDay.set(day, (spendByDay.get(day) || 0) + (Number(r.spend) || 0));
  }

  const statusOf = (roas) => roas >= targetRoas ? "good" : (roas >= 1 ? "warn" : "bad");
  const last7 = [...spendByDay.keys()].sort().slice(-7);

  const campaigns = [...byCamp.values()].map((a) => {
    const key = normKey(a.campaign_name);
    const ord = ordByCamp.get(key) || { orders: 0, revenue: 0 };
    const trueRoas = div(ord.revenue, a.spend);
    const trend = last7.map((d) => {
      const s = a.days.get(d) || 0;
      const rev = ordByCampDay.get(key + "|" + d) || 0;
      return Number(div(rev, s).toFixed(2));
    });
    return {
      campaign_id: a.campaign_id, campaign_name: a.campaign_name,
      spend: a.spend, impressions: a.impressions, clicks: a.clicks, reach: a.reach,
      frequency: div(a.freqSum, a.freqN),
      ctr: div(a.clicks, a.impressions) * 100,
      cpc: div(a.spend, a.clicks),
      cpm: div(a.spend, a.impressions) * 1000,
      cvr: div(ord.orders, a.clicks) * 100,
      cpa: div(a.spend, ord.orders),
      orders: ord.orders, revenue: ord.revenue,
      metaConversions: a.meta_conversions,
      metaRoas: div(a.meta_conversion_value, a.spend),
      trueRoas, status: statusOf(trueRoas), trend,
    };
  }).sort((x, y) => y.spend - x.spend);

  const sum = (f) => campaigns.reduce((s, c) => s + f(c), 0);
  const tSpend = sum((c) => c.spend), tImp = sum((c) => c.impressions), tClicks = sum((c) => c.clicks);
  const tReach = sum((c) => c.reach), tOrders = sum((c) => c.orders), tRev = sum((c) => c.revenue);
  const tMetaVal = sum((c) => c.metaRoas * c.spend), tMetaConv = sum((c) => c.metaConversions);
  const totals = {
    spend: tSpend, impressions: tImp, clicks: tClicks, reach: tReach,
    frequency: div(tImp, tReach), ctr: div(tClicks, tImp) * 100,
    cpc: div(tSpend, tClicks), cpm: div(tSpend, tImp) * 1000,
    cvr: div(tOrders, tClicks) * 100, cpa: div(tSpend, tOrders),
    orders: tOrders, revenue: tRev, metaConversions: tMetaConv,
    trueRoas: div(tRev, tSpend), metaRoas: div(tMetaVal, tSpend),
  };

  const paid = campaigns.filter((c) => c.spend > 0);
  const best = paid.length ? paid.reduce((a, b) => (b.trueRoas > a.trueRoas ? b : a)) : null;
  const worst = paid.length ? paid.reduce((a, b) => (b.trueRoas < a.trueRoas ? b : a)) : null;

  const dailySeries = [...new Set([...spendByDay.keys(), ...revByDay.keys()])].sort()
    .map((d) => ({ date: d, spend: spendByDay.get(d) || 0, revenue: revByDay.get(d) || 0 }));

  const allocation = campaigns.map((c) => ({ campaign_name: c.campaign_name, spend: c.spend, pct: div(c.spend, tSpend) * 100, status: c.status }));

  const funnel = { impressions: tImp, clicks: tClicks, purchases: tOrders };

  return { totals, campaigns, best, worst, dailySeries, allocation, funnel, configured: campaigns.length > 0 };
}
```

- [ ] **Step 4: 執行確認通過** — `npx vitest run lib/ad-report.test.js` → PASS。
- [ ] **Step 5: Commit** — `git add lib/ad-report.js lib/ad-report.test.js` → `git commit -m "feat(ads): ROAS join and derived metrics report (pure)"`

---

## Task 3: `lib/meta-ads.js`（Meta API 取數，guarded）

**Files:** Create: `lib/meta-ads.js`; Test: `lib/meta-ads.test.js`

**Interfaces:**
- Produces:
  - `normalizeInsightRow(raw) -> { campaign_id, campaign_name, date, spend, impressions, clicks, reach, frequency, meta_conversions, meta_conversion_value }`（純；數值字串轉數字；從 actions/action_values 抽購買）
  - `isConfigured() -> boolean`（`META_ADS_ACCESS_TOKEN` && `META_AD_ACCOUNT_ID` 皆有）
  - `fetchInsights({ since, until }) -> Promise<normalizedRow[]>`（未設定則丟 `Error("not_configured")`；打 Graph API、分頁、錯誤丟出）

- [ ] **Step 1: 寫失敗測試**

Create `lib/meta-ads.test.js`:
```js
import { describe, it, expect } from "vitest";
import { normalizeInsightRow } from "./meta-ads.js";

describe("normalizeInsightRow", () => {
  it("字串數值轉數字、日期取 date_start", () => {
    const r = normalizeInsightRow({ campaign_id: "1", campaign_name: "Brand", date_start: "2026-07-28", date_stop: "2026-07-28", spend: "1200.50", impressions: "20000", clicks: "800", reach: "9500", frequency: "2.11", ctr: "4.0", cpc: "1.5", cpm: "60" });
    expect(r.campaign_id).toBe("1"); expect(r.spend).toBeCloseTo(1200.5, 2);
    expect(r.impressions).toBe(20000); expect(r.date).toBe("2026-07-28");
    expect(r.frequency).toBeCloseTo(2.11, 2);
  });
  it("從 actions/action_values 抽購買（含 pixel/omni 別名）", () => {
    const r = normalizeInsightRow({ campaign_id: "1", date_start: "2026-07-28", spend: "100",
      actions: [{ action_type: "link_click", value: "50" }, { action_type: "offsite_conversion.fb_pixel_purchase", value: "3" }],
      action_values: [{ action_type: "offsite_conversion.fb_pixel_purchase", value: "11997" }] });
    expect(r.meta_conversions).toBe(3); expect(r.meta_conversion_value).toBeCloseTo(11997, 2);
  });
  it("無 actions 時購買為 0、缺欄不炸", () => {
    const r = normalizeInsightRow({ campaign_id: "2", date_start: "2026-07-28" });
    expect(r.meta_conversions).toBe(0); expect(r.spend).toBe(0);
  });
});
```

- [ ] **Step 2: 執行確認失敗** — `npx vitest run lib/meta-ads.test.js` → FAIL。

- [ ] **Step 3: 實作**

Create `lib/meta-ads.js`:
```js
// lib/meta-ads.js — Meta Marketing API insights（guarded）。純轉換可測，網路呼叫真跑於部署後。
const PURCHASE_TYPES = new Set(["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"]);

function sumActions(arr) {
  if (!Array.isArray(arr)) return 0;
  return arr.reduce((s, a) => s + (PURCHASE_TYPES.has(a?.action_type) ? Number(a.value) || 0 : 0), 0);
}

export function normalizeInsightRow(raw = {}) {
  return {
    campaign_id: String(raw.campaign_id || ""),
    campaign_name: raw.campaign_name || null,
    date: String(raw.date_start || "").slice(0, 10),
    spend: Number(raw.spend) || 0,
    impressions: Number(raw.impressions) || 0,
    clicks: Number(raw.clicks) || 0,
    reach: Number(raw.reach) || 0,
    frequency: Number(raw.frequency) || 0,
    meta_conversions: sumActions(raw.actions),
    meta_conversion_value: sumActions(raw.action_values),
  };
}

export function isConfigured() {
  return !!(process.env.META_ADS_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID);
}

export async function fetchInsights({ since, until } = {}) {
  if (!isConfigured()) throw new Error("not_configured");
  const ver = process.env.META_API_VERSION || "v25.0";
  const acct = process.env.META_AD_ACCOUNT_ID; // 形如 act_123 或 123
  const actId = acct.startsWith("act_") ? acct : "act_" + acct;
  const fields = "campaign_id,campaign_name,spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,action_values";
  const params = new URLSearchParams({
    level: "campaign", time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    fields, limit: "200", access_token: process.env.META_ADS_ACCESS_TOKEN,
  });
  let url = `https://graph.facebook.com/${ver}/${actId}/insights?${params.toString()}`;
  const rows = [];
  for (let page = 0; page < 50 && url; page++) {
    const res = await fetch(url);
    const json = await res.json();
    if (json.error) throw new Error(`meta_api_${json.error.code || "err"}: ${json.error.message || "unknown"}`);
    for (const r of json.data || []) rows.push(normalizeInsightRow(r));
    url = json.paging?.next || null;
  }
  return rows;
}
```
> ⚠️ 實作/部署時以 Context7（`/websites/developers_facebook_marketing-api`）或 Meta 官方確認當前 Graph API 版本（本計畫寫 v25.0）與購買 action_type 別名。

- [ ] **Step 4: 執行確認通過** — `npx vitest run lib/meta-ads.test.js` → PASS。
- [ ] **Step 5: Commit** — `git add lib/meta-ads.js lib/meta-ads.test.js` → `git commit -m "feat(ads): Meta insights API client (guarded, normalized)"`

---

## Task 4: 同步 Cron（guarded）+ vercel.json

**Files:** Create: `app/api/cron/sync-ad-insights/route.js`; Modify: `vercel.json`

**Interfaces:** Consumes `isConfigured`/`fetchInsights`（Task 3）、`getSupabaseAdmin`。Produces `GET /api/cron/sync-ad-insights`（Bearer CRON_SECRET）→ 未設定 no-op；否則撈近 7 天 upsert `ad_insights`。

- [ ] **Step 1: 實作 cron**

Create `app/api/cron/sync-ad-insights/route.js`:
```js
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isConfigured, fetchInsights } from "@/lib/meta-ads";

// Meta 廣告 insights 每日同步（比照 release-coupons 的 auth）。未設 Meta env 時 no-op。
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isConfigured()) return NextResponse.json({ ok: true, skipped: "not_configured" });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "no_db" }, { status: 500 });

  const days = 7;
  const until = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString().slice(0, 10);
  try {
    const rows = await fetchInsights({ since, until });
    let upserted = 0;
    for (const r of rows) {
      if (!r.campaign_id || !r.date) continue;
      const { error } = await supabase.from("ad_insights").upsert({
        platform: "meta", campaign_id: r.campaign_id, campaign_name: r.campaign_name, date: r.date,
        spend: r.spend, impressions: r.impressions, clicks: r.clicks, reach: r.reach, frequency: r.frequency,
        meta_conversions: r.meta_conversions, meta_conversion_value: r.meta_conversion_value,
        updated_at: new Date().toISOString(),
      }, { onConflict: "platform,campaign_id,date" });
      if (!error) upserted++;
    }
    return NextResponse.json({ ok: true, since, until, fetched: rows.length, upserted });
  } catch (e) {
    console.error("[sync-ad-insights] failed", e?.message || e);
    return NextResponse.json({ ok: false, error: e?.message || "sync_failed" }, { status: 200 });
  }
}
```

- [ ] **Step 2: vercel.json 加每日 cron** —— 在 `crons` 加一項（**每日**，Hobby 限制）：
```json
    { "path": "/api/cron/sync-ad-insights", "schedule": "20 5 * * *" }
```

- [ ] **Step 3: 驗證** — `npm test`（既有綠）+ `npm run build`（新 route 編譯）。手動端到端於部署後（未設 token → `skipped:"not_configured"`；未帶 secret → 401）。
- [ ] **Step 4: Commit** — `git add app/api/cron/sync-ad-insights/route.js vercel.json` → `git commit -m "feat(ads): daily Meta insights sync cron (guarded)"`

---

## Task 5: Admin API `/api/admin/ad-insights`

**Files:** Create: `app/api/admin/ad-insights/route.js`

**Interfaces:** Consumes `verifyAdminToken`、`getSupabaseAdmin`、`buildAdReport`（Task 2）。Produces `GET ?days=30`（JWT）→ 讀 `ad_insights` + 該期已付款 orders → 回 `buildAdReport` 結果（空資料回空報表）。

- [ ] **Step 1: 實作**

Create `app/api/admin/ad-insights/route.js`:
```js
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { buildAdReport } from "@/lib/ad-report";

export async function GET(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const days = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 30));
  const sinceISO = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const sinceDate = sinceISO.slice(0, 10);
  const targetRoas = Number(process.env.META_TARGET_ROAS) || 3;

  const [{ data: insights, error: e1 }, { data: orders, error: e2 }] = await Promise.all([
    sb.from("ad_insights").select("campaign_id, campaign_name, date, spend, impressions, clicks, reach, frequency, meta_conversions, meta_conversion_value").gte("date", sinceDate),
    sb.from("orders").select("amount, created_at, attribution").eq("status", "paid").gte("created_at", sinceISO),
  ]);
  if (e1 || e2) return NextResponse.json({ error: (e1 || e2).message }, { status: 500 });

  const report = buildAdReport({ insights: insights || [], paidOrders: orders || [], targetRoas });
  return NextResponse.json({ data: report, days, targetRoas });
}
```

- [ ] **Step 2: 驗證** — `npm test` 綠。手動：未帶 token → 401（部署後）。
- [ ] **Step 3: Commit** — `git add app/api/admin/ad-insights/route.js` → `git commit -m "feat(ads): admin ad-insights report API"`

---

## Task 6: 儀錶板 `AdsPerformancePage.jsx` + 後臺掛載

**Files:** Create: `app/admin/AdsPerformancePage.jsx`; Modify: `app/admin/page.jsx`

**Interfaces:** Consumes `/api/admin/ad-insights`（Task 5，回 `{data: report}`）；token 取用比照 `SaleSettingsPage`（`sessionStorage.inrecord_admin_token` + Bearer）。

**依據：** 逐一 port 核准的視覺示意稿
`/private/tmp/claude-501/-Users-zhoubolong/5af26749-b601-4b5f-996f-1ac279935856/scratchpad/ad-performance-dashboard.html`
—— 版面（行動提示 callout → KPI → 漏斗/受眾 mini → 趨勢圖 → 賺賠散點＋花費分配＋漏斗 → 明細表含 sparkline）、色彩 token、SVG 生成邏輯（趨勢 area、散點、sparkline、分配條、漏斗）**直接照該檔 port 成 React**，但資料改讀 API 的 `report`（`report.totals/campaigns/best/worst/dailySeries/allocation/funnel`），而非 mockup 的假數據。

- [ ] **Step 1: 建立 AdsPerformancePage.jsx**

READ the mockup file first. 實作 `"use client"` 元件 `AdsPerformancePage({ showToast })`：
1. `adminFetch("/api/admin/ad-insights?days=" + days)` 於掛載與日期範圍改變時取 `report`；`days` state（7/30/90）。
2. **空狀態**：`!report || !report.configured || report.totals.spend === 0` → 顯示置中空狀態卡：「尚未有廣告數據」＋說明「設定 Meta 追蹤碼與 `META_ADS_ACCESS_TOKEN` / `META_AD_ACCOUNT_ID`、廣告投放後每日自動同步」＋日期範圍仍可切。
3. **有資料**：照 mockup 版面渲染，資料來源對映：
   - callout：`report.best`（🏆 最賺・該擴量）、`report.worst`（⚠️ 虧損・該檢視）
   - KPI：`totals.trueRoas`（hero，附 `totals.metaRoas` 高報對比）、`totals.cpa`、`totals.spend`、`totals.revenue`
   - mini：曝光/觸及/頻率/點擊/CTR/CVR（`totals`）
   - 趨勢圖：`dailySeries`（spend vs revenue area）
   - 散點：`campaigns`（x=spend, y=trueRoas, r∝revenue, 色=status, 目標線=targetRoas）
   - 花費分配：`allocation`；漏斗：`funnel`（曝光→點擊→購買；若無 InitiateCheckout 資料則 3 階段）
   - 明細表：`campaigns`（含 7 天 sparkline `c.trend`、虧損列 `status==='bad'` 淡紅底）
   - SVG chart 生成沿用 mockup 的函式邏輯（可用 `dangerouslySetInnerHTML` 或 JSX，其一即可）；狀態色一律配數字+位置。
4. 樣式沿用 mockup（可 inline 或轉 CSS module；保留 `tabular-nums`、深淺色 token、`word-break:keep-all`）。

> UI 為大型元件；忠實 port mockup 即可，勿自行重設計。取不到資料/錯誤 → `showToast` + 空狀態，不可崩潰。

- [ ] **Step 2: 後臺掛載**

Modify `app/admin/page.jsx`：
1. `import AdsPerformancePage from "./AdsPerformancePage";`
2. lucide 匯入清單加 `BarChart3`（或既有相近 icon）。
3. `NAV_GROUPS`「學員服務」群組（`analytics` 銷售分析 之後）加：`{ id:"ads", label:"廣告成效", icon: BarChart3 },`
4. tab 渲染處加：`{page==="ads" && <AdsPerformancePage showToast={showToast}/>}`

- [ ] **Step 3: 驗證** — `npm test`（既有綠）+ `npm run build`（頁面編譯）。手動（部署後）：後臺→廣告成效 → 未設 token 顯示空狀態、不崩潰。
- [ ] **Step 4: Commit** — `git add app/admin/AdsPerformancePage.jsx app/admin/page.jsx` → `git commit -m "feat(ads): ad performance dashboard page and nav"`

---

## 收尾驗證（全部後）
- [ ] `npm test` 全綠（ad-report、meta-ads）。
- [ ] `npm run build` 成功。
- [ ] 部署後安全閘：cron 未帶 secret→401、未設 token→`skipped:"not_configured"`；admin API 未帶 token→401；後臺廣告成效顯示空狀態不崩潰。

## 部署
```bash
# 1) SQL 先行（additive）——controller 套正式 DB(vmslzbcegfljlopkewpx)：supabase-ad-insights.sql
# 2) push + 部署
git rev-parse --abbrev-ref HEAD
gh auth switch --user inrecmusic
git push
npx vercel --prod   # cron 每日；Hobby 允許每日 cron
# 3) CLAUDE.md：加 supabase-ad-insights.sql 到 runbook、cron 表加一列、env 加 META_ADS_ACCESS_TOKEN/META_AD_ACCOUNT_ID/META_API_VERSION/META_TARGET_ROAS 說明
# 4) 待使用者：Meta 設定好後填 4 個 env → 重部署 → 廣告跑幾天 → 儀錶板自動亮
```
