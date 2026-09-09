# 後台營運助理（每週報告，唯讀）實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每週一台灣時間 08:00 由排程用程式算好上週營運數字，交給 Claude 產生一句總結、重點、風險、建議（附後台頁面），存表、後台可看、寄摘要信；完全唯讀、沒 API key 就跳過。

**Architecture:** `lib/ops-report/` 四個純模組（`period`＋`collect` 聚合、`schema` 結構化輸出與白名單、`generate` 呼叫 Anthropic SDK、`email` 摘要信 Markdown）＋讀取層 `load.js`（Supabase／Brevo／既有 helper）。三支路由：cron（CRON_SECRET）、admin 讀取、admin 手動產生。後台新頁 `OpsAssistantPage`。新表 `ops_reports`。

**Tech Stack:** Next.js 14 App Router、`@anthropic-ai/sdk`（`messages.create`＋`output_config.format` json_schema、adaptive thinking、effort medium）、Supabase service role、Vercel Cron、Vitest。

**Spec:** `docs/superpowers/specs/2026-09-09-ops-assistant-design.md`

## Global Constraints

- 模型 `claude-opus-5`；`thinking: { type: "adaptive" }`；`output_config: { effort: "medium", format: { type: "json_schema", schema } }`；`max_tokens: 8000`；system prompt 加 `cache_control: { type: "ephemeral" }`。
- 未設 `ANTHROPIC_API_KEY` → cron 回 `{ ok: true, skipped: "no_api_key" }`、admin run 回 503 `no_api_key`、頁面顯示未設定；**任何情況不影響既有功能**。
- 所有數字由 `collect.js` 算，模型只解讀；模型輸出的 `admin_path` 必須在白名單（後台 nav id）內，否則丟棄該建議。
- 期間：台灣時間（UTC+8，無夏令）上週一 00:00 至本週一 00:00；同期間 cron 報告只產生一次（冪等）。
- Email 只出現在 `pending_actions`；報告只存 `ops_reports` 與寄 `ADMIN_EMAIL`。
- 文案繁體中文台灣口語；commit 訊息中文；每任務 `npx vitest run <檔>` 綠燈再 commit；**commit 前確認 cwd 在 worktree**。

---

### Task 1: 期間計算、JSON schema、白名單（純函式）＋SQL＋安裝 SDK

**Files:**
- Create: `lib/ops-report/period.js`、`lib/ops-report/schema.js`、`supabase-ops-reports.sql`
- Test: `lib/ops-report/period.test.js`、`lib/ops-report/schema.test.js`
- Modify: `package.json`（`npm i @anthropic-ai/sdk`）

**Interfaces:**
- Produces:
  - `weeklyPeriod(now = new Date())` → `{ start: Date, end: Date, prevStart: Date, label: "M/D–M/D" }`：`end`＝台灣時間本週一 00:00，`start`＝end−7 天，`prevStart`＝start−7 天。
  - `ADMIN_PAGES`（陣列，後台 nav id 白名單）、`REPORT_SCHEMA`（json schema 物件）、`sanitizeReport(raw)` → 丟掉 `admin_path` 不在白名單的建議、裁 highlights 最多 5、risks level 只允許 high|medium|low，缺欄位補空陣列。

- [ ] **Step 1: 寫失敗的測試**

```js
// lib/ops-report/period.test.js
import { describe, it, expect } from "vitest";
import { weeklyPeriod } from "./period.js";

describe("weeklyPeriod（台灣時間，週一 00:00 切）", () => {
  it("週一 08:00 台灣＝上週一 00:00 至本週一 00:00", () => {
    const p = weeklyPeriod(new Date("2026-09-14T00:00:00Z")); // 台灣 9/14（一）08:00
    expect(p.end.toISOString()).toBe("2026-09-13T16:00:00.000Z");   // 9/14 00:00 台灣
    expect(p.start.toISOString()).toBe("2026-09-06T16:00:00.000Z"); // 9/7 00:00 台灣
    expect(p.prevStart.toISOString()).toBe("2026-08-30T16:00:00.000Z");
    expect(p.label).toBe("9/7–9/13");
  });
  it("週日深夜（台灣 23:59）仍屬上一週，end 是上上週一之後的那個週一", () => {
    const p = weeklyPeriod(new Date("2026-09-13T15:59:00Z")); // 台灣 9/13（日）23:59
    expect(p.end.toISOString()).toBe("2026-09-06T16:00:00.000Z");   // 9/7 00:00
    expect(p.label).toBe("8/31–9/6");
  });
});
```

```js
// lib/ops-report/schema.test.js
import { describe, it, expect } from "vitest";
import { ADMIN_PAGES, REPORT_SCHEMA, sanitizeReport } from "./schema.js";

describe("schema／sanitizeReport", () => {
  it("白名單含後台既有 nav id；schema 為 object 且 required 齊", () => {
    for (const id of ["dashboard", "orders", "students", "newsletter", "coupons", "courses", "ads", "sale", "announcements", "ops"]) expect(ADMIN_PAGES).toContain(id);
    expect(REPORT_SCHEMA.type).toBe("object");
    expect(REPORT_SCHEMA.required).toEqual(["headline", "highlights", "risks", "suggestions", "metrics"]);
    expect(REPORT_SCHEMA.additionalProperties).toBe(false);
  });
  it("丟掉 admin_path 不在白名單的建議、裁 highlights 到 5、risk level 非法改 medium、缺欄位補空", () => {
    const r = sanitizeReport({
      headline: "h",
      highlights: ["1", "2", "3", "4", "5", "6"],
      risks: [{ level: "critical", text: "x" }, { level: "low", text: "y" }],
      suggestions: [{ title: "a", why: "w", admin_path: "orders" }, { title: "b", why: "w", admin_path: "http://evil" }],
    });
    expect(r.highlights).toHaveLength(5);
    expect(r.risks[0].level).toBe("medium");
    expect(r.suggestions).toEqual([{ title: "a", why: "w", admin_path: "orders" }]);
    expect(r.metrics).toEqual({});
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/ops-report`
Expected: FAIL（找不到模組）

- [ ] **Step 3: 實作＋SQL＋安裝 SDK**

```js
// lib/ops-report/period.js — 週報期間：台灣時間（UTC+8，無夏令）上週一 00:00 至本週一 00:00。
const TW_OFFSET_MS = 8 * 3600 * 1000;
const DAY_MS = 86400 * 1000;

export function weeklyPeriod(now = new Date()) {
  const tw = new Date(now.getTime() + TW_OFFSET_MS);            // 以 UTC 欄位表示台灣牆上時間
  const sinceMonday = (tw.getUTCDay() + 6) % 7;                  // 週一=0 … 週日=6
  const mondayTw = Date.UTC(tw.getUTCFullYear(), tw.getUTCMonth(), tw.getUTCDate() - sinceMonday);
  const end = new Date(mondayTw - TW_OFFSET_MS);
  const start = new Date(end.getTime() - 7 * DAY_MS);
  const prevStart = new Date(start.getTime() - 7 * DAY_MS);
  const md = (d) => { const t = new Date(d.getTime() + TW_OFFSET_MS); return `${t.getUTCMonth() + 1}/${t.getUTCDate()}`; };
  return { start, end, prevStart, label: `${md(start)}–${md(new Date(end.getTime() - DAY_MS))}` };
}
```

```js
// lib/ops-report/schema.js — 模型輸出的結構化 schema、後台頁面白名單、輸出清洗。
export const ADMIN_PAGES = ["dashboard", "courses", "messages", "media", "students", "orders", "customer", "subscriptions", "coupons", "analytics", "ads", "sale", "tracking", "audit", "newsletter", "announcements", "ops"];

export const REPORT_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", description: "一句話總結上週（台灣繁中）" },
    highlights: { type: "array", items: { type: "string" }, description: "3 到 5 個重點，每條引用資料包內的數字" },
    risks: { type: "array", items: { type: "object", properties: { level: { type: "string", enum: ["high", "medium", "low"] }, text: { type: "string" } }, required: ["level", "text"], additionalProperties: false } },
    suggestions: { type: "array", items: { type: "object", properties: { title: { type: "string" }, why: { type: "string" }, admin_path: { type: "string", description: `後台頁面 id，只能是：${ADMIN_PAGES.join(", ")}` } }, required: ["title", "why", "admin_path"], additionalProperties: false } },
    metrics: { type: "object", description: "從資料包原樣回填的關鍵數字（本週 vs 上週）", additionalProperties: true },
  },
  required: ["headline", "highlights", "risks", "suggestions", "metrics"],
  additionalProperties: false,
};

const LEVELS = new Set(["high", "medium", "low"]);
export function sanitizeReport(raw = {}) {
  const arr = (v) => (Array.isArray(v) ? v : []);
  return {
    headline: String(raw?.headline || ""),
    highlights: arr(raw?.highlights).map(String).slice(0, 5),
    risks: arr(raw?.risks).map((r) => ({ level: LEVELS.has(r?.level) ? r.level : "medium", text: String(r?.text || "") })).filter((r) => r.text),
    suggestions: arr(raw?.suggestions).filter((s) => s && ADMIN_PAGES.includes(s.admin_path)).map((s) => ({ title: String(s.title || ""), why: String(s.why || ""), admin_path: s.admin_path })),
    metrics: raw?.metrics && typeof raw.metrics === "object" ? raw.metrics : {},
  };
}
```

```sql
-- supabase-ops-reports.sql
-- ────────────────────────────────────────────────────────────────────────
-- 後台營運助理週報（2026-09-09）：每週 cron 產生一份，存模型輸出與資料包；唯讀報告。冪等可重跑。
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ops_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start  TIMESTAMPTZ NOT NULL,
  period_end    TIMESTAMPTZ NOT NULL,
  triggered_by  TEXT NOT NULL DEFAULT 'cron',
  report        JSONB NOT NULL,
  pack          JSONB NOT NULL,
  model         TEXT,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  cost_usd      NUMERIC(8,4),
  emailed_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ops_reports_period_idx ON ops_reports (period_end DESC, triggered_by);
ALTER TABLE ops_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_ops_reports" ON ops_reports;
CREATE POLICY "service_role_ops_reports" ON ops_reports
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
```

Run: `npm i @anthropic-ai/sdk --no-audit --no-fund`

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/ops-report`
Expected: PASS（4 tests）

- [ ] **Step 5: Commit**

```bash
git add lib/ops-report/period.js lib/ops-report/period.test.js lib/ops-report/schema.js lib/ops-report/schema.test.js supabase-ops-reports.sql package.json package-lock.json
git commit -m "feat(ops): 營運週報基礎——期間計算、輸出 schema／白名單、ops_reports SQL、安裝 Anthropic SDK"
```

---

### Task 2: 資料包聚合（純函式）與讀取層

**Files:**
- Create: `lib/ops-report/collect.js`（純函式 `buildPack`＋各區塊小函式）、`lib/ops-report/load.js`（讀 Supabase／Brevo／廣告）
- Test: `lib/ops-report/collect.test.js`

**Interfaces:**
- Consumes: `weeklyPeriod`（Task 1）、`summarizeOrders`（`lib/reconciliation.js`）、`pickUngrantedPayuni`（`lib/order-enrolled.js`）、`buildAdReport`（`lib/ad-report.js`）、`isConfigured`（`lib/meta-ads.js`）、`quotaSummary/pickSendLimitPlan/planWindow`（`lib/brevo-quota.js`）、`currentPrice`（`lib/sale.js`）、`selectAll`（`lib/supabase-paginate.js`）。
- Produces:
  - `buildPack({ period, orders, prevOrders, enrolledEmails, progressRows, emailLog, unsubscribes, coupons, saleSettings, videos, announcements, adReport, brevoQuota, leadsCount, now })` → 固定鍵序的 pack 物件（見 Step 3）。
  - `loadPack(supabase, { now = new Date(), env = process.env, fetchImpl = fetch } = {})` → `Promise<pack>`：讀資料後呼叫 `buildPack`。

- [ ] **Step 1: 寫失敗的測試**

```js
// lib/ops-report/collect.test.js
import { describe, it, expect } from "vitest";
import { buildPack, couponAnomalies, upcomingDates } from "./collect.js";

const period = { start: new Date("2026-09-06T16:00:00Z"), end: new Date("2026-09-13T16:00:00Z"), prevStart: new Date("2026-08-30T16:00:00Z"), label: "9/7–9/13" };
const o = (over) => ({ status: "paid", amount: 4299, created_at: "2026-09-08T03:00:00Z", source: "payuni", email: "a@x.com", plan: "bundle", ...over });

describe("buildPack", () => {
  it("訂單：本週／上週分開算，卡住 pending 超過 72 小時才算，來源分布", () => {
    const now = new Date("2026-09-14T00:00:00Z");
    const pack = buildPack({
      period, now,
      orders: [o(), o({ source: "concert" }), o({ status: "pending", created_at: "2026-09-07T00:00:00Z" }), o({ status: "pending", created_at: "2026-09-13T12:00:00Z" }), o({ status: "refunded", amount: 5500 })],
      prevOrders: [o({ created_at: "2026-09-01T00:00:00Z" })],
      enrolledEmails: ["a@x.com"], progressRows: [], emailLog: [], unsubscribes: [], coupons: [], saleSettings: {}, videos: [], announcements: [], adReport: null, brevoQuota: null, leadsCount: null,
    });
    expect(pack.period.label).toBe("9/7–9/13");
    expect(pack.orders).toMatchObject({ created: 5, paid: 2, revenue: 8598, refunded: 1, refund_amount: 5500, stuck_pending: 1 });
    expect(pack.orders.by_source).toEqual({ payuni: 1, concert: 1 });
    expect(pack.prev_orders).toMatchObject({ created: 1, paid: 1, revenue: 4299 });
  });

  it("待處理：已付款未開通名單（只 payuni）、寄信失敗清單最多 10 筆", () => {
    const pack = buildPack({
      period, now: new Date(),
      orders: [o({ email: "ung@x.com" }), o({ email: "ok@x.com" }), o({ source: "concert", email: "c@x.com" })],
      prevOrders: [], enrolledEmails: ["ok@x.com"],
      emailLog: [{ to_email: "f@x.com", kind: "newsletter", status: "failed", created_at: "2026-09-08T00:00:00Z" }, { to_email: "s@x.com", kind: "trial", status: "sent", created_at: "2026-09-08T00:00:00Z" }],
      progressRows: [], unsubscribes: [], coupons: [], saleSettings: {}, videos: [], announcements: [], adReport: null, brevoQuota: null, leadsCount: null,
    });
    expect(pack.pending_actions.ungranted.map((u) => u.email)).toEqual(["ung@x.com"]);
    expect(pack.pending_actions.failed_emails).toEqual([{ to: "f@x.com", kind: "newsletter", at: "2026-09-08T00:00:00Z" }]);
    expect(pack.newsletter.sent).toBe(1);
  });

  it("學員：本週有觀看的人數、觀看單元數、完成單元數；內容：已發布無影片單元；草稿公告數", () => {
    const pack = buildPack({
      period, now: new Date(), orders: [], prevOrders: [], enrolledEmails: ["a@x.com", "b@x.com"],
      progressRows: [{ user_id: "u1", watched_at: "2026-09-08T00:00:00Z", completed: true, viewed_seconds: 600 }, { user_id: "u1", watched_at: "2026-09-09T00:00:00Z", completed: false, viewed_seconds: 100 }, { user_id: "u2", watched_at: "2026-08-01T00:00:00Z", completed: true, viewed_seconds: 50 }],
      emailLog: [], unsubscribes: [], coupons: [], saleSettings: {},
      videos: [{ title: "1-1", published: true, bunny_video_id: "x" }, { title: "2-1", published: true, bunny_video_id: null }, { title: "9-9", published: false, bunny_video_id: null }],
      announcements: [{ published: false }, { published: true }], adReport: null, brevoQuota: null, leadsCount: 12,
    });
    expect(pack.students).toEqual({ enrolled: 2, active_this_week: 1, units_watched_this_week: 2, units_completed_this_week: 1, viewed_minutes_all_time: 13 });
    expect(pack.content).toEqual({ published_units: 2, units_without_video: 1, first_missing_unit: "2-1" });
    expect(pack.drafts.announcements_unpublished).toBe(1);
    expect(pack.newsletter.leads).toBe(12);
  });
});

describe("couponAnomalies", () => {
  it("指定價券低於當前波段價、名稱像測試、無上限指定價券 → 列為異常", () => {
    const settings = { waves: [{ starts_at: "2026-09-06T16:00:00Z", ends_at: "2026-09-20T16:00:00Z", prices: { bundle: 4299, course: 5500 } }], list_price: { bundle: 6999, course: 6800 } };
    const now = new Date("2026-09-10T00:00:00Z");
    const list = couponAnomalies([
      { code: "SMOKETEST1", type: "price", value: 1, status: "active", usage_limit: 5 },
      { code: "FAN3999", type: "price", value: 3999, status: "active", usage_limit: null, plan: "bundle" },
      { code: "OK10", type: "percent", value: 10, status: "active", usage_limit: 100 },
      { code: "OLD1", type: "price", value: 1, status: "disabled", usage_limit: 1 },
    ], settings, now);
    expect(list.map((a) => a.code)).toEqual(["SMOKETEST1", "FAN3999"]);
    expect(list[0].reasons).toContain("test_like");
    expect(list[0].reasons).toContain("below_current_price");
    expect(list[1].reasons).toEqual(["below_current_price", "unlimited_price_coupon"]);
  });
});

describe("upcomingDates", () => {
  it("14 天內的波段換價、粉絲截止、固定里程碑", () => {
    const settings = { waves: [{ starts_at: "2026-09-20T16:00:00Z", ends_at: "2026-10-04T16:00:00Z", prices: { bundle: 4799 } }], fan_plan: { enabled: true, deadline: "2026-09-14T23:59:59+08:00" } };
    const list = upcomingDates(settings, new Date("2026-09-14T00:00:00Z"));
    expect(list.map((u) => u.label)).toEqual(["粉絲方案截止", "波段換價：bundle 4799", "第一批章節上架（Ch1～Ch5）"]);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/ops-report/collect.test.js`
Expected: FAIL（找不到 ./collect.js）

- [ ] **Step 3: 實作**

```js
// lib/ops-report/collect.js — 週報資料包：全部數字由這裡算（純函式），模型只解讀。鍵序固定（快取／可核對）。
import { summarizeOrders } from "../reconciliation.js";
import { pickUngrantedPayuni } from "../order-enrolled.js";
import { currentPrice } from "../sale.js";

const DAY_MS = 86400 * 1000;
const inRange = (iso, start, end) => { const t = Date.parse(iso || ""); return t >= start.getTime() && t < end.getTime(); };

function orderBlock(orders, now) {
  const s = summarizeOrders(orders);
  const bySource = {};
  for (const o of orders) if (o.status === "paid") bySource[o.source || "unknown"] = (bySource[o.source || "unknown"] || 0) + 1;
  const stuck = orders.filter((o) => o.status === "pending" && now.getTime() - Date.parse(o.created_at) > 72 * 3600 * 1000).length;
  return { created: orders.length, paid: s.paid.count, revenue: s.paid.amount, refunded: s.refunded.count, refund_amount: s.refunded.amount, stuck_pending: stuck, by_source: bySource };
}

export function couponAnomalies(coupons = [], settings = {}, now = new Date()) {
  const out = [];
  for (const c of coupons) {
    if ((c.status || "active") !== "active") continue;
    const reasons = [];
    if (/TEST|SMOKE|DEMO/i.test(c.code || "")) reasons.push("test_like");
    if (c.type === "price") {
      const plan = c.plan || "bundle";
      const cur = currentPrice(plan, settings, now);
      if (Number.isFinite(cur) && Number(c.value) < cur) reasons.push("below_current_price");
      if (c.usage_limit == null) reasons.push("unlimited_price_coupon");
    }
    if (reasons.length) out.push({ code: c.code, type: c.type, value: c.value, usage_limit: c.usage_limit ?? null, reasons });
  }
  return out;
}

const MILESTONES = [["2026-09-30T00:00:00+08:00", "第一批章節上架（Ch1～Ch5）"], ["2026-10-31T00:00:00+08:00", "正式開課日：全數上架"]];
export function upcomingDates(settings = {}, now = new Date(), days = 14) {
  const horizon = now.getTime() + days * DAY_MS;
  const items = [];
  const fp = settings.fan_plan || {};
  if (fp.enabled && fp.deadline) items.push({ at: fp.deadline, label: "粉絲方案截止" });
  for (const w of settings.waves || []) {
    const prices = Object.entries(w.prices || {}).map(([k, v]) => `${k} ${v}`).join("、");
    items.push({ at: w.starts_at, label: `波段換價：${prices}` });
  }
  for (const [at, label] of MILESTONES) items.push({ at, label });
  return items
    .map((i) => ({ ...i, t: Date.parse(i.at) }))
    .filter((i) => Number.isFinite(i.t) && i.t >= now.getTime() && i.t <= horizon)
    .sort((a, b) => a.t - b.t)
    .map(({ at, label }) => ({ at, label }));
}

export function buildPack({ period, now = new Date(), orders = [], prevOrders = [], enrolledEmails = [], progressRows = [], emailLog = [], unsubscribes = [], coupons = [], saleSettings = {}, videos = [], announcements = [], adReport = null, brevoQuota = null, leadsCount = null }) {
  const { start, end } = period;
  const weekLog = emailLog.filter((e) => inRange(e.created_at, start, end));
  const weekProgress = progressRows.filter((p) => inRange(p.watched_at, start, end));
  const activeUsers = new Set(weekProgress.map((p) => p.user_id));
  const withVideo = videos.filter((v) => v.published);
  const missing = withVideo.filter((v) => !v.bunny_video_id);
  return {
    period: { start: start.toISOString(), end: end.toISOString(), label: period.label },
    orders: orderBlock(orders, now),
    prev_orders: orderBlock(prevOrders, now),
    pending_actions: {
      ungranted: pickUngrantedPayuni(orders.filter((o) => o.status === "paid"), enrolledEmails).map((o) => ({ email: o.email, plan: o.plan, paid_at: o.updated_at || o.created_at })),
      failed_emails: weekLog.filter((e) => e.status !== "sent").slice(0, 10).map((e) => ({ to: e.to_email, kind: e.kind, at: e.created_at })),
    },
    students: {
      enrolled: enrolledEmails.length,
      active_this_week: activeUsers.size,
      units_watched_this_week: weekProgress.length,
      units_completed_this_week: weekProgress.filter((p) => p.completed).length,
      viewed_minutes_all_time: Math.round(progressRows.reduce((a, p) => a + (Number(p.viewed_seconds) || 0), 0) / 60),
    },
    newsletter: {
      sent: weekLog.filter((e) => e.status === "sent").length,
      unsubscribes: unsubscribes.filter((u) => inRange(u.created_at, start, end)).length,
      quota: brevoQuota,
      leads: leadsCount,
    },
    ads: adReport,
    coupons: { active: coupons.filter((c) => (c.status || "active") === "active").length, anomalies: couponAnomalies(coupons, saleSettings, now) },
    content: { published_units: withVideo.length, units_without_video: missing.length, first_missing_unit: missing[0]?.title || null },
    drafts: { announcements_unpublished: announcements.filter((a) => !a.published).length },
    upcoming: upcomingDates(saleSettings, now),
  };
}
```

```js
// lib/ops-report/load.js — 讀取層：從 Supabase／Brevo／廣告表撈資料，交給 buildPack。任何外部失敗都退成 null，不讓週報整份失敗。
import { selectAll } from "../supabase-paginate.js";
import { buildAdReport } from "../ad-report.js";
import { isConfigured as adsConfigured } from "../meta-ads.js";
import { quotaSummary, pickSendLimitPlan, planWindow } from "../brevo-quota.js";
import { weeklyPeriod } from "./period.js";
import { buildPack } from "./collect.js";

async function safe(p, fallback = []) { try { return await p; } catch { return fallback; } }

async function fetchBrevoQuota(env, fetchImpl) {
  if (!env.BREVO_API_KEY) return null;
  try {
    const H = { "api-key": env.BREVO_API_KEY };
    const acc = await (await fetchImpl("https://api.brevo.com/v3/account", { headers: H })).json();
    const { start, end } = planWindow(pickSendLimitPlan(acc));
    const rep = await (await fetchImpl(`https://api.brevo.com/v3/smtp/statistics/aggregatedReport?startDate=${start}&endDate=${end}`, { headers: H })).json();
    return quotaSummary(acc, rep.requests);
  } catch { return null; }
}

async function fetchLeadsCount(env, fetchImpl) {
  if (env.LEAD_CAPTURE !== "on" || !env.BREVO_API_KEY || !env.BREVO_LIST_ID) return null;
  try {
    const r = await fetchImpl(`https://api.brevo.com/v3/contacts/lists/${env.BREVO_LIST_ID}`, { headers: { "api-key": env.BREVO_API_KEY } });
    const d = await r.json();
    return Number.isFinite(d.totalSubscribers) ? d.totalSubscribers : null;
  } catch { return null; }
}

export async function loadPack(supabase, { now = new Date(), env = process.env, fetchImpl = fetch } = {}) {
  const period = weeklyPeriod(now);
  const sinceISO = period.prevStart.toISOString();
  const [allOrders, enrollments, progressRows, emailLog, unsubscribes, coupons, saleRow, videos, announcements] = await Promise.all([
    safe(selectAll(supabase, "orders", (q) => q.select("status, amount, created_at, updated_at, source, email, grant_email, plan, coupon_code, attribution").gte("created_at", sinceISO))),
    safe(selectAll(supabase, "enrollments", (q) => q.select("email"))),
    safe(selectAll(supabase, "progress", (q) => q.select("user_id, completed, viewed_seconds, watched_at"))),
    safe(selectAll(supabase, "email_log", (q) => q.select("to_email, kind, status, created_at").gte("created_at", period.start.toISOString()))),
    safe(selectAll(supabase, "newsletter_unsubscribes", (q) => q.select("email, created_at"))),
    safe(selectAll(supabase, "coupons", (q) => q.select("code, type, value, status, usage_limit, plan").is("batch_id", null))),
    safe(supabase.from("sale_settings").select("*").eq("id", "default").maybeSingle().then((r) => r.data), {}),
    safe(selectAll(supabase, "videos", (q) => q.select("title, published, bunny_video_id"))),
    safe(selectAll(supabase, "announcements", (q) => q.select("published"))),
  ]);
  const orders = allOrders.filter((o) => Date.parse(o.created_at) >= period.start.getTime() && Date.parse(o.created_at) < period.end.getTime());
  const prevOrders = allOrders.filter((o) => Date.parse(o.created_at) >= period.prevStart.getTime() && Date.parse(o.created_at) < period.start.getTime());
  let adReport = null;
  if (adsConfigured()) {
    const [insights, paid] = await Promise.all([
      safe(selectAll(supabase, "ad_insights", (q) => q.select("campaign_id, campaign_name, date, spend, impressions, clicks, reach, frequency, meta_conversions, meta_conversion_value").gte("date", period.start.toISOString().slice(0, 10)))),
      safe(selectAll(supabase, "orders", (q) => q.select("amount, created_at, attribution").eq("status", "paid").gte("created_at", period.start.toISOString()))),
    ]);
    try { adReport = buildAdReport({ insights, paidOrders: paid, targetRoas: Number(env.META_TARGET_ROAS) || 3 }); } catch { adReport = null; }
  }
  const [brevoQuota, leadsCount] = await Promise.all([fetchBrevoQuota(env, fetchImpl), fetchLeadsCount(env, fetchImpl)]);
  return buildPack({
    period, now, orders, prevOrders,
    enrolledEmails: enrollments.map((e) => e.email).filter(Boolean),
    progressRows, emailLog, unsubscribes, coupons, saleSettings: saleRow || {}, videos, announcements, adReport, brevoQuota, leadsCount,
  });
}
```

（實作前先確認 `lib/ad-report.js` 的 `buildAdReport` 參數與 `ad_insights` 欄位名稱＝`app/api/admin/ad-insights/route.js` 所用；若欄位名不同，照該路由改。）

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/ops-report`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/ops-report/collect.js lib/ops-report/collect.test.js lib/ops-report/load.js
git commit -m "feat(ops): 週報資料包——訂單／待處理／學員／電子報／廣告／優惠券異常／內容進度／近期時程（純函式＋讀取層）"
```

---

### Task 3: 呼叫 Claude 產生報告（generate.js）

**Files:**
- Create: `lib/ops-report/generate.js`
- Test: `lib/ops-report/generate.test.js`

**Interfaces:**
- Consumes: `REPORT_SCHEMA`、`sanitizeReport`（Task 1）。
- Produces:
  - `SYSTEM_PROMPT`（字串常數）、`buildMessages(pack)` → `[{ role: "user", content: string }]`。
  - `generateReport(pack, { client, model = "claude-opus-5" })` → `{ report, model, usage: { input_tokens, output_tokens }, cost_usd }`；`client` 為 `new Anthropic()` 實例（可注入 mock）。
  - `estimateCostUsd(usage, model)`：Opus 5 輸入 $5／百萬、輸出 $25／百萬。

- [ ] **Step 1: 寫失敗的測試**

```js
// lib/ops-report/generate.test.js
import { describe, it, expect, vi } from "vitest";
import { generateReport, buildMessages, estimateCostUsd, SYSTEM_PROMPT } from "./generate.js";

const pack = { period: { label: "9/7–9/13" }, orders: { paid: 2 } };

describe("generateReport", () => {
  it("用 claude-opus-5、adaptive thinking、effort medium、json_schema 輸出；解析文字區塊 JSON、清洗、算成本", async () => {
    const create = vi.fn(async () => ({
      content: [{ type: "text", text: JSON.stringify({ headline: "h", highlights: ["a"], risks: [], suggestions: [{ title: "t", why: "w", admin_path: "orders" }, { title: "bad", why: "w", admin_path: "nope" }], metrics: { paid: 2 } }) }],
      usage: { input_tokens: 30000, output_tokens: 2000 },
      stop_reason: "end_turn",
    }));
    const r = await generateReport(pack, { client: { messages: { create } } });
    const req = create.mock.calls[0][0];
    expect(req.model).toBe("claude-opus-5");
    expect(req.thinking).toEqual({ type: "adaptive" });
    expect(req.output_config.effort).toBe("medium");
    expect(req.output_config.format.type).toBe("json_schema");
    expect(req.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(req.messages[0].content).toContain('"label":"9/7–9/13"');
    expect(r.report.suggestions).toEqual([{ title: "t", why: "w", admin_path: "orders" }]);
    expect(r.usage).toEqual({ input_tokens: 30000, output_tokens: 2000 });
    expect(r.cost_usd).toBeCloseTo(0.15 + 0.05, 4);
  });

  it("refusal 或非 JSON 回應 → 丟可辨識錯誤", async () => {
    const refused = { messages: { create: vi.fn(async () => ({ content: [], stop_reason: "refusal", usage: { input_tokens: 1, output_tokens: 0 } })) } };
    await expect(generateReport(pack, { client: refused })).rejects.toThrow(/refusal/);
    const junk = { messages: { create: vi.fn(async () => ({ content: [{ type: "text", text: "not json" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } })) } };
    await expect(generateReport(pack, { client: junk })).rejects.toThrow(/parse/);
  });

  it("buildMessages 序列化穩定；SYSTEM_PROMPT 含「只能引用資料包數字」規則", () => {
    expect(buildMessages(pack)[0].content).toBe(buildMessages(pack)[0].content);
    expect(SYSTEM_PROMPT).toMatch(/資料包/);
    expect(estimateCostUsd({ input_tokens: 1_000_000, output_tokens: 0 }, "claude-opus-5")).toBe(5);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/ops-report/generate.test.js`
Expected: FAIL

- [ ] **Step 3: 實作**

```js
// lib/ops-report/generate.js — 把資料包交給 Claude 寫週報（單次呼叫、無工具、結構化輸出）。
import { REPORT_SCHEMA, sanitizeReport, ADMIN_PAGES } from "./schema.js";

export const MODEL = "claude-opus-5";
const PRICE = { "claude-opus-5": { input: 5, output: 25 } }; // 美元／百萬 tokens

export const SYSTEM_PROMPT = [
  "你是 InRecord（線上鋼琴課程平台）的營運顧問，每週一早上讀取「資料包」寫一份給站主看的營運週報。",
  "規則：",
  "1. 只能引用資料包裡出現的數字與事實，不得推算或臆測沒有的資料；資料為 null 代表尚未接上，直說「尚未接上」即可。",
  "2. 繁體中文、台灣口語、簡潔；重點 3 到 5 條，每條帶數字並與上週比較。",
  "3. 風險依嚴重度標 high／medium／low；建議要具體、可執行，並指出對應後台頁面 id（只能用：" + ADMIN_PAGES.join("、") + "）。",
  "4. 你沒有任何執行權限，不得建議自動化執行；所有動作都由站主在後台完成。",
  "5. metrics 欄位把本週與上週的關鍵數字原樣回填，方便畫表。",
].join("\n");

export function buildMessages(pack) {
  return [{ role: "user", content: `資料包（本週與上週）：\n${JSON.stringify(pack)}` }];
}

export function estimateCostUsd(usage = {}, model = MODEL) {
  const p = PRICE[model] || PRICE[MODEL];
  return ((usage.input_tokens || 0) * p.input + (usage.output_tokens || 0) * p.output) / 1_000_000;
}

export async function generateReport(pack, { client, model = MODEL } = {}) {
  const res = await client.messages.create({
    model,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: REPORT_SCHEMA } },
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: buildMessages(pack),
  });
  if (res.stop_reason === "refusal") throw new Error("model_refusal");
  const text = (res.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error("report_parse_failed"); }
  const usage = { input_tokens: res.usage?.input_tokens || 0, output_tokens: res.usage?.output_tokens || 0 };
  return { report: sanitizeReport(raw), model, usage, cost_usd: Number(estimateCostUsd(usage, model).toFixed(4)) };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/ops-report/generate.test.js`
Expected: PASS（3 tests）

- [ ] **Step 5: Commit**

```bash
git add lib/ops-report/generate.js lib/ops-report/generate.test.js
git commit -m "feat(ops): 週報產生——Claude Opus 5 結構化輸出、輸出清洗、成本估算"
```

---

### Task 4: 摘要信＋三支路由

**Files:**
- Create: `lib/ops-report/email.js`、`app/api/cron/ops-report/route.js`、`app/api/admin/ops-report/route.js`、`app/api/admin/ops-report/run/route.js`
- Test: `lib/ops-report/email.test.js`、`app/api/cron/ops-report/route.test.js`
- Modify: `vercel.json`（加 cron）

**Interfaces:**
- Consumes: `loadPack`（Task 2）、`generateReport`（Task 3）、`weeklyPeriod`（Task 1）、`sendNewsletterEmail`（`lib/brevo-email.js`）、`renderAdminEmailHtml`（`lib/newsletter.js`）、`verifyAdminToken`、`getSupabaseAdmin`。
- Produces:
  - `buildReportEmail(report, periodLabel)` → `{ subject, bodyMd }`。
  - `runOpsReport(supabase, { triggeredBy, now, env, sendEmail })` → `{ row, skipped? }`（共用於 cron 與手動；放在 `lib/ops-report/run.js`）。
  - `GET /api/cron/ops-report`、`GET /api/admin/ops-report?limit=&id=`、`POST /api/admin/ops-report/run`。

- [ ] **Step 1: 寫失敗的測試**

```js
// lib/ops-report/email.test.js
import { describe, it, expect } from "vitest";
import { buildReportEmail } from "./email.js";

describe("buildReportEmail", () => {
  it("主旨含期間；內文有總結、重點、風險、建議（附後台提示）、數字表", () => {
    const { subject, bodyMd } = buildReportEmail({
      headline: "穩定成長", highlights: ["付款 8 筆（上週 5）"], risks: [{ level: "high", text: "2 位付款未開通" }],
      suggestions: [{ title: "開通名單", why: "付了錢等課", admin_path: "orders" }], metrics: { paid: 8, prev_paid: 5 },
    }, "9/7–9/13");
    expect(subject).toBe("InRecord 營運週報 9/7–9/13");
    expect(bodyMd).toContain("## 本週一句話");
    expect(bodyMd).toContain("- 付款 8 筆（上週 5）");
    expect(bodyMd).toContain("🔴 2 位付款未開通");
    expect(bodyMd).toContain("**開通名單**（後台 → 訂單管理）");
    expect(bodyMd).toContain("| paid | 8 |");
  });
});
```

```js
// app/api/cron/ops-report/route.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn(() => ({})) }));
const runOpsReport = vi.fn();
vi.mock("@/lib/ops-report/run", () => ({ runOpsReport: (...a) => runOpsReport(...a) }));
import { GET } from "./route";

const req = (auth) => new Request("http://x/api/cron/ops-report", { headers: auth ? { authorization: auth } : {} });

describe("GET /api/cron/ops-report", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("CRON_SECRET", "s"); vi.stubEnv("ANTHROPIC_API_KEY", "k"); });
  afterEach(() => vi.unstubAllEnvs());
  it("沒帶或錯的 Bearer → 401", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
  });
  it("未設 ANTHROPIC_API_KEY → 200 skipped，不跑", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const r = await GET(req("Bearer s"));
    expect(await r.json()).toEqual({ ok: true, skipped: "no_api_key" });
    expect(runOpsReport).not.toHaveBeenCalled();
  });
  it("正常 → 呼叫 runOpsReport（triggeredBy=cron）並回 ok", async () => {
    runOpsReport.mockResolvedValue({ row: { id: "r1" } });
    const r = await GET(req("Bearer s"));
    expect(runOpsReport.mock.calls[0][1]).toMatchObject({ triggeredBy: "cron" });
    expect(await r.json()).toMatchObject({ ok: true, id: "r1" });
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/ops-report/email.test.js app/api/cron/ops-report`
Expected: FAIL

- [ ] **Step 3: 實作**

```js
// lib/ops-report/email.js — 週報摘要信（Markdown → renderAdminEmailHtml）
const PAGE_LABEL = { dashboard: "儀表板", courses: "課程管理", messages: "留言管理", media: "媒體中心", students: "學員管理", orders: "訂單管理", customer: "客戶查詢", subscriptions: "遊戲存取", coupons: "優惠券", analytics: "數據分析", ads: "廣告成效", sale: "銷售設定", tracking: "追蹤碼", audit: "操作紀錄", newsletter: "電子報", announcements: "教室公告", ops: "營運助理" };
const LEVEL_ICON = { high: "🔴", medium: "🟠", low: "🟢" };

export function buildReportEmail(report, periodLabel) {
  const lines = [`## 本週一句話`, report.headline, "", `## 重點`, ...report.highlights.map((h) => `- ${h}`)];
  if (report.risks.length) lines.push("", "## 風險", ...report.risks.map((r) => `- ${LEVEL_ICON[r.level] || "🟠"} ${r.text}`));
  if (report.suggestions.length) lines.push("", "## 建議", ...report.suggestions.map((s) => `- **${s.title}**（後台 → ${PAGE_LABEL[s.admin_path] || s.admin_path}）：${s.why}`));
  const entries = Object.entries(report.metrics || {}).filter(([, v]) => typeof v !== "object");
  if (entries.length) lines.push("", "## 關鍵數字", "| 指標 | 值 |", "|---|---|", ...entries.map(([k, v]) => `| ${k} | ${v} |`));
  lines.push("", "完整報告與歷史紀錄在後台「營運助理」。此信由系統每週自動產生，數字皆由程式計算。");
  return { subject: `InRecord 營運週報 ${periodLabel}`, bodyMd: lines.join("\n") };
}
```

```js
// lib/ops-report/run.js — cron 與手動共用的一次執行：撈資料包 → 產生 → 寫表 → （cron）寄信。
import Anthropic from "@anthropic-ai/sdk";
import { weeklyPeriod } from "./period.js";
import { loadPack } from "./load.js";
import { generateReport } from "./generate.js";
import { buildReportEmail } from "./email.js";
import { renderAdminEmailHtml } from "../newsletter.js";
import { sendNewsletterEmail } from "../brevo-email.js";

export async function runOpsReport(supabase, { triggeredBy = "cron", now = new Date(), env = process.env, client = null } = {}) {
  const period = weeklyPeriod(now);
  if (triggeredBy === "cron") {
    const { data: existing } = await supabase.from("ops_reports").select("id").eq("triggered_by", "cron").eq("period_end", period.end.toISOString()).maybeSingle();
    if (existing) return { row: existing, existing: true };
  }
  const pack = await loadPack(supabase, { now, env });
  const anthropic = client || new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const { report, model, usage, cost_usd } = await generateReport(pack, { client: anthropic });
  const { data: row, error } = await supabase.from("ops_reports").insert({
    period_start: period.start.toISOString(), period_end: period.end.toISOString(), triggered_by: triggeredBy,
    report, pack, model, input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, cost_usd,
  }).select("id, period_start, period_end, report, created_at").single();
  if (error) throw new Error(error.message);
  if (triggeredBy === "cron" && env.ADMIN_EMAIL) {
    const { subject, bodyMd } = buildReportEmail(report, period.label);
    const r = await sendNewsletterEmail({ to: env.ADMIN_EMAIL, subject, html: renderAdminEmailHtml({ subject, bodyMd, siteUrl: env.NEXT_PUBLIC_SITE_URL || "https://inrecordmusic.com" }), kind: "ops_report" });
    if (r.success) await supabase.from("ops_reports").update({ emailed_at: new Date().toISOString() }).eq("id", row.id);
  }
  return { row };
}
```

```js
// app/api/cron/ops-report/route.js
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { runOpsReport } from "@/lib/ops-report/run";

// 營運週報 cron（每週一 00:00 UTC＝台灣 08:00）。fail-safe：未設 ANTHROPIC_API_KEY 直接跳過。
export const maxDuration = 120;
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ ok: true, skipped: "no_api_key" });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "no_db" }, { status: 500 });
  try {
    const { row, existing } = await runOpsReport(supabase, { triggeredBy: "cron" });
    return NextResponse.json({ ok: true, id: row.id, existing: !!existing });
  } catch (e) {
    console.error("[ops-report cron]", e?.message || e);
    return NextResponse.json({ ok: false, error: "generate_failed" }, { status: 500 });
  }
}
```

```js
// app/api/admin/ops-report/route.js — 後台讀取週報（列表／單份）
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { serverError } from "@/lib/api-error";

export async function GET(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: true, data: [], configured: false });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 12));
  const q = id
    ? sb.from("ops_reports").select("*").eq("id", id).maybeSingle()
    : sb.from("ops_reports").select("id, period_start, period_end, triggered_by, report, model, input_tokens, output_tokens, cost_usd, emailed_at, created_at").order("created_at", { ascending: false }).limit(limit);
  const { data, error } = await q;
  if (error) return serverError(error);
  return NextResponse.json({ ok: true, data: data ?? (id ? null : []), configured: !!process.env.ANTHROPIC_API_KEY });
}
```

```js
// app/api/admin/ops-report/run/route.js — 後台「立刻產生」（過去 7 天到現在，不寄信；10 分鐘一次）
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { logAudit } from "@/lib/audit";
import { runOpsReport } from "@/lib/ops-report/run";

export const maxDuration = 120;
export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "no_api_key" }, { status: 503 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const { data: last } = await sb.from("ops_reports").select("created_at").eq("triggered_by", "manual").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (last && Date.now() - Date.parse(last.created_at) < 10 * 60 * 1000) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  try {
    const { row } = await runOpsReport(sb, { triggeredBy: "manual" });
    await logAudit(sb, { actor: payload.email, action: "ops_report.run", targetType: "ops_report", targetId: row.id, meta: {}, req });
    return NextResponse.json({ ok: true, data: row });
  } catch (e) {
    console.error("[ops-report run]", e?.message || e);
    return NextResponse.json({ error: "generate_failed" }, { status: 500 });
  }
}
```

`vercel.json` crons 加：`{ "path": "/api/cron/ops-report", "schedule": "0 0 * * 1" }`。

（`runOpsReport` 手動模式的期間：為了「過去 7 天到現在」，在 `run.js` 對 `triggeredBy === "manual"` 改用 `{ start: now−7d, end: now, prevStart: now−14d, label }`——在 `period.js` 加 `rollingPeriod(now)` 並補一個測試：`rollingPeriod(new Date("2026-09-10T00:00:00Z")).end` 等於 now、`start` 為 7 天前。）

- [ ] **Step 4: 跑測試確認通過＋lint**

Run: `npx vitest run lib/ops-report app/api/cron/ops-report && npx next lint --file app/api/cron/ops-report/route.js --file app/api/admin/ops-report/route.js --file app/api/admin/ops-report/run/route.js --file lib/ops-report/run.js`
Expected: PASS、無 lint 錯誤

- [ ] **Step 5: Commit**

```bash
git add lib/ops-report/email.js lib/ops-report/email.test.js lib/ops-report/run.js lib/ops-report/period.js lib/ops-report/period.test.js app/api/cron/ops-report app/api/admin/ops-report vercel.json
git commit -m "feat(ops): 週報摘要信、cron／後台讀取／手動產生三支路由、每週一排程"
```

---

### Task 5: 後台「營運助理」頁＋文件

**Files:**
- Create: `app/admin/OpsAssistantPage.jsx`
- Modify: `app/admin/page.jsx`（import、nav 加 `{ id:"ops", label:"營運助理", icon:Sparkles }`、渲染 `{page==="ops"&&<OpsAssistantPage showToast={showToast} onNavigate={setPage}/>}`）
- Modify: `CLAUDE.md`（環境變數 `ANTHROPIC_API_KEY`、部署 SQL 順序加 `supabase-ops-reports.sql`、架構決策一段）
- Test: `app/admin/OpsAssistantPage.test.jsx`（jsdom）

**Interfaces:**
- Consumes: `GET /api/admin/ops-report`、`POST /api/admin/ops-report/run`（Task 4）；`adminFetch`（`lib/admin-client.js`）。
- Produces: 元件 `OpsAssistantPage({ showToast, onNavigate })`。

- [ ] **Step 1: 寫失敗的測試**

```jsx
// app/admin/OpsAssistantPage.test.jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
const api = vi.fn();
vi.mock("@/lib/admin-client", () => ({ adminFetch: (...a) => api(...a) }));
import OpsAssistantPage from "./OpsAssistantPage";
afterEach(cleanup); beforeEach(() => vi.clearAllMocks());
const report = { headline: "穩", highlights: ["付款 8 筆"], risks: [{ level: "high", text: "2 位未開通" }], suggestions: [{ title: "去開通", why: "等課", admin_path: "orders" }], metrics: { paid: 8 } };
const row = { id: "r1", period_start: "2026-09-06T16:00:00Z", period_end: "2026-09-13T16:00:00Z", triggered_by: "cron", report, model: "claude-opus-5", input_tokens: 30000, output_tokens: 2000, cost_usd: 0.2, created_at: "2026-09-13T16:05:00Z" };

describe("OpsAssistantPage", () => {
  it("有報告：顯示總結、重點、風險、建議按鈕可導到後台頁、成本註腳", async () => {
    api.mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: [row], configured: true }) });
    const onNavigate = vi.fn();
    render(<OpsAssistantPage onNavigate={onNavigate} />);
    expect(await screen.findByText("穩")).toBeTruthy();
    expect(screen.getByText("付款 8 筆")).toBeTruthy();
    expect(screen.getByText(/2 位未開通/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /訂單管理/ }));
    expect(onNavigate).toHaveBeenCalledWith("orders");
    expect(screen.getByText(/claude-opus-5/)).toBeTruthy();
  });
  it("未設 API key：說明文字、按鈕停用", async () => {
    api.mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: [], configured: false }) });
    render(<OpsAssistantPage />);
    expect(await screen.findByText(/尚未設定 ANTHROPIC_API_KEY/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /立刻產生/ }).disabled).toBe(true);
  });
  it("立刻產生：POST run 後把新報告放到最前面", async () => {
    api.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, data: [], configured: true }) })
       .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, data: { ...row, id: "r2", triggered_by: "manual" } }) });
    render(<OpsAssistantPage showToast={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /立刻產生/ }));
    await waitFor(() => expect(screen.getByText("穩")).toBeTruthy());
    expect(api.mock.calls[1][0]).toBe("/api/admin/ops-report/run");
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run app/admin/OpsAssistantPage.test.jsx`
Expected: FAIL

- [ ] **Step 3: 實作頁面**

```jsx
// app/admin/OpsAssistantPage.jsx
"use client";
import { useEffect, useState } from "react";
import { adminFetch as _api } from "@/lib/admin-client";
import styles from "./admin.module.css";

// 營運助理：每週一自動產生的營運週報（唯讀）。左列表、右內容；「立刻產生」跑過去 7 天。
const PAGE_LABEL = { dashboard: "儀表板", courses: "課程管理", messages: "留言管理", media: "媒體中心", students: "學員管理", orders: "訂單管理", customer: "客戶查詢", subscriptions: "遊戲存取", coupons: "優惠券", analytics: "數據分析", ads: "廣告成效", sale: "銷售設定", tracking: "追蹤碼", audit: "操作紀錄", newsletter: "電子報", announcements: "教室公告", ops: "營運助理" };
const LEVEL = { high: ["高", "#dc2626", "#fef2f2"], medium: ["中", "#b45309", "#fffbeb"], low: ["低", "#047857", "#ecfdf5"] };
const fmtDate = (iso) => new Date(iso).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric" });

export default function OpsAssistantPage({ showToast, onNavigate }) {
  const [rows, setRows] = useState([]);
  const [sel, setSel] = useState(null);
  const [configured, setConfigured] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    _api("/api/admin/ops-report?limit=12").then((r) => r.json()).then((d) => {
      if (d?.ok) { setRows(d.data || []); setSel((d.data || [])[0] || null); setConfigured(d.configured !== false); }
    }).catch(() => {});
  }, []);

  async function runNow() {
    setBusy(true);
    try {
      const r = await _api("/api/admin/ops-report/run", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) { setRows((prev) => [d.data, ...prev]); setSel(d.data); showToast?.("✅ 週報已產生"); }
      else showToast?.("❌ 產生失敗：" + (d.error === "rate_limited" ? "10 分鐘內只能產生一次" : d.error || r.status));
    } catch (e) { showToast?.("❌ 產生失敗：" + e.message); }
    finally { setBusy(false); }
  }

  const rep = sel?.report;
  const metrics = Object.entries(rep?.metrics || {}).filter(([, v]) => typeof v !== "object");
  return (
    <div>
      <div className={styles.pageHeader} style={{ flexWrap: "wrap", gap: 12 }}>
        <div><h1>營運助理</h1><p>每週一早上 8 點自動整理上週營運週報；數字由程式計算，Claude 只負責解讀與建議。唯讀，不會自動執行任何動作。</p></div>
        <div className={styles.pageActions}>
          <button className={styles.btnPrimary} disabled={busy || !configured} onClick={runNow}>{busy ? "產生中…" : "立刻產生（過去 7 天）"}</button>
        </div>
      </div>
      {!configured && <div className={styles.panel} style={{ marginBottom: 16, color: "#92400e", background: "#fffbeb" }}>尚未設定 ANTHROPIC_API_KEY，排程會自動跳過。到 Vercel 環境變數設好並重新部署後，這裡就會開始出現週報。</div>}
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16 }}>
        <div className={styles.panel}>
          <strong style={{ fontSize: 13, color: "#475569" }}>歷史週報</strong>
          <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
            {rows.length === 0 && <span className={styles.dim} style={{ fontSize: 13 }}>還沒有報告</span>}
            {rows.map((r) => (
              <button key={r.id} className={styles.btnSmall} style={{ textAlign: "left", background: sel?.id === r.id ? "#eff6ff" : undefined }} onClick={() => setSel(r)}>
                {fmtDate(r.period_start)}–{fmtDate(new Date(Date.parse(r.period_end) - 86400000).toISOString())}
                <span className={styles.dim} style={{ marginLeft: 6, fontSize: 11 }}>{r.triggered_by === "manual" ? "手動" : "排程"}</span>
              </button>
            ))}
          </div>
        </div>
        <div className={styles.panel}>
          {!rep ? <span className={styles.dim}>選一份報告，或按「立刻產生」。</span> : (
            <>
              <h2 style={{ margin: "0 0 6px", fontSize: 20 }}>{rep.headline}</h2>
              <p className={styles.dim} style={{ fontSize: 12, margin: "0 0 16px" }}>期間 {fmtDate(sel.period_start)}–{fmtDate(new Date(Date.parse(sel.period_end) - 86400000).toISOString())}・{sel.triggered_by === "manual" ? "手動產生" : "排程產生"}</p>
              <h3 style={{ fontSize: 14, margin: "14px 0 6px" }}>重點</h3>
              <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 4 }}>{rep.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>
              {rep.risks?.length > 0 && (<>
                <h3 style={{ fontSize: 14, margin: "16px 0 6px" }}>風險</h3>
                <div style={{ display: "grid", gap: 6 }}>{rep.risks.map((r, i) => { const [t, fg, bg] = LEVEL[r.level] || LEVEL.medium; return <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><span style={{ fontSize: 11, fontWeight: 800, color: fg, background: bg, borderRadius: 6, padding: "2px 6px", flex: "none" }}>{t}</span><span>{r.text}</span></div>; })}</div>
              </>)}
              {rep.suggestions?.length > 0 && (<>
                <h3 style={{ fontSize: 14, margin: "16px 0 6px" }}>建議</h3>
                <div style={{ display: "grid", gap: 8 }}>{rep.suggestions.map((s, i) => (
                  <div key={i} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <strong>{s.title}</strong>
                      <button className={styles.btnSmall} onClick={() => onNavigate?.(s.admin_path)}>前往 {PAGE_LABEL[s.admin_path] || s.admin_path}</button>
                    </div>
                    <p style={{ margin: "4px 0 0", fontSize: 13, color: "#475569" }}>{s.why}</p>
                  </div>))}</div>
              </>)}
              {metrics.length > 0 && (<>
                <h3 style={{ fontSize: 14, margin: "16px 0 6px" }}>關鍵數字</h3>
                <table className={styles.table}><tbody>{metrics.map(([k, v]) => <tr key={k}><td style={{ color: "#64748b" }}>{k}</td><td style={{ fontVariantNumeric: "tabular-nums" }}>{String(v)}</td></tr>)}</tbody></table>
              </>)}
              <p className={styles.dim} style={{ fontSize: 11, marginTop: 16 }}>模型 {sel.model}・輸入 {sel.input_tokens} tokens・輸出 {sel.output_tokens} tokens・約 US${Number(sel.cost_usd || 0).toFixed(2)}{sel.emailed_at ? "・摘要信已寄" : ""}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

（`styles.table` 若 admin.module.css 沒有，改用內嵌 `style={{ width: "100%", borderCollapse: "collapse" }}`。）

`app/admin/page.jsx`：import `OpsAssistantPage`；nav 陣列在 `newsletter` 之後加 `{ id:"ops", label:"營運助理", icon:Sparkles }`（`Sparkles` 來自 `lucide-react`，若未 import 則加）；渲染區加 `{page==="ops" &&<OpsAssistantPage showToast={showToast} onNavigate={setPage}/>}`。

`CLAUDE.md`：環境變數加 `ANTHROPIC_API_KEY   # 後台營運助理週報（cron ops-report）；未設＝排程跳過、後台顯示未設定`；部署 SQL 順序在 `supabase-terms-consent.sql` 之後加 `→ **supabase-ops-reports.sql**（營運助理週報 ops_reports，自帶 RLS service_role policy，idempotent）`；架構決策加一條「營運助理」。

- [ ] **Step 4: 跑測試確認通過（全套）＋lint**

Run: `npx vitest run && npx next lint --file app/admin/OpsAssistantPage.jsx --file app/admin/page.jsx`
Expected: 全部 PASS、無 lint 錯誤

- [ ] **Step 5: Commit**

```bash
git add app/admin/OpsAssistantPage.jsx app/admin/OpsAssistantPage.test.jsx app/admin/page.jsx CLAUDE.md
git commit -m "feat(admin): 營運助理頁——週報列表／內容／建議導頁／立刻產生；文件"
```

---

### Task 6: SQL、部署 preview、驗證空狀態

- [ ] **Step 1: 正式 DB 跑 `supabase-ops-reports.sql`**（使用者於 Supabase SQL editor 執行；或 Supabase MCP）。preview 與正式共用 DB。
- [ ] **Step 2: 部署 preview**：`npx vercel --yes && npx vercel alias set <url> inrecord-preview-inrec.vercel.app`。
- [ ] **Step 3: 驗證**：`curl -H "Authorization: Bearer <CRON_SECRET>" <preview>/api/cron/ops-report` → 未設 key 時 `{ ok: true, skipped: "no_api_key" }`（CRON_SECRET 為機密，這步由 Vercel Cron 觸發或跳過）；後台「營運助理」頁顯示未設定說明（後台密碱只在 Production → 上正式站後看）。
- [ ] **Step 4: 上正式站（使用者同意後）**：merge → push → `vercel --prod`。之後使用者提供 `ANTHROPIC_API_KEY`（Production＋Preview）→ 重部署 → 後台「立刻產生」跑第一份真報告。
