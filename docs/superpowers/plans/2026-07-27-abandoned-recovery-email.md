# 未成交挽回信 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 過 6–48 小時仍未付款的 pending 訂單，每小時由 cron 自動寄一封純提醒挽回信（Brevo），原子旗標防重寄。

**Architecture:** 複用既有 pending 訂單與 `release-coupons` cron 樣式（Bearer `CRON_SECRET`、時間 cutoff、原子 guard 防與 notify 競態）。純邏輯（候選篩選 + 信件內容）放 `lib/recovery.js` 可測；cron 呼叫既有通用寄信函式 `sendNewsletterEmail`（DRY，不新增 brevo 函式）。

**Tech Stack:** Next.js 14.2.35 App Router、Supabase（`getSupabaseAdmin`）、Brevo（`lib/brevo-email.js`）、Vercel Cron、Vitest。

## Global Constraints

- **語言**：信件文案繁體中文。
- **複用**：cron 認證比照 `app/api/cron/release-coupons/route.js`（`process.env.CRON_SECRET`、`auth !== \`Bearer ${secret}\`` → 401）；寄信用既有 `sendNewsletterEmail({ to, subject, html, kind })`（**勿新增 brevo 寄信函式**）；DB 用 `getSupabaseAdmin()`。
- **原子性**：claim 用 `update ... .eq("id").eq("status","pending").is("recovery_sent_at",null).select("id").maybeSingle()`；未回列＝略過（防重寄＋防與 notify 競態）。寄失敗 → `update recovery_sent_at=null` 還原重試。
- **邊界**：只處理 `status='pending'`；時間窗 `[now-maxHours, now-minHours]`（預設 6/48h）；每單最多一封。
- **CTA 連結**（verbatim）：`https://inrecordmusic.com/?utm_source=email&utm_medium=email&utm_campaign=abandoned_recovery#pricing`
- **安全**：`plan_label` 由 checkout body 帶入、可能被客戶端影響 → 放進 email HTML 前**必須跳脫** `& < > " '`。email 不落一般 log。
- **測試**：Vitest node 環境；單檔 `npx vitest run <path>`，全部 `npm test`。已知 `esbuild/oxc` 設定警告為專案既有、非本功能，忽略。
- **Git**：分支 `feat/point2-carousel`；**只 `git add` 明確路徑**（禁 `-A`）；commit 前 `git rev-parse --abbrev-ref HEAD` 確認；訊息結尾加 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- **部署（全部後）**：`supabase-recovery.sql` 先套正式 DB（additive）→ `gh auth switch --user inrecmusic` → push → `npx vercel --prod`。⚠️ Vercel 方案 cron 限制：Hobby 上限 2 個 cron/每日；本專案已有 2 個 cron，新增第 3 個（且每小時）需 Pro → 部署時確認方案，若受限則改每日或升級。

---

## 檔案結構

**新增**
- `supabase-recovery.sql` — `orders.recovery_sent_at` 欄
- `lib/recovery.js` — `selectRecoveryCandidates` + `buildRecoveryEmail`（純函式）
- `lib/recovery.test.js`
- `app/api/cron/abandoned-recovery/route.js` — cron

**修改**
- `vercel.json` — 加 cron 排程

> 註：`lib/brevo-email.js` **不改**（複用既有 `sendNewsletterEmail`）。

---

## Task 1: 資料庫遷移（orders.recovery_sent_at）

**Files:**
- Create: `supabase-recovery.sql`

**Interfaces:**
- Produces: `orders.recovery_sent_at timestamptz`（nullable，挽回信原子去重旗標）。

- [ ] **Step 1: 寫遷移 SQL**

Create `supabase-recovery.sql`:

```sql
-- 未成交挽回信：原子去重旗標（每單最多寄一封）
alter table orders add column if not exists recovery_sent_at timestamptz;
```

- [ ] **Step 2: 驗證（語法）**

此檔於 deploy 階段由 controller 套正式 DB（additive、idempotent）。本地確認語法無誤即可（單一 `alter table ... add column if not exists`）。

- [ ] **Step 3: Commit**

```bash
git rev-parse --abbrev-ref HEAD   # feat/point2-carousel
git add supabase-recovery.sql
git commit -m "feat(recovery): add orders.recovery_sent_at column"
```

---

## Task 2: `lib/recovery.js`（候選篩選 + 信件內容，純函式）

**Files:**
- Create: `lib/recovery.js`
- Test: `lib/recovery.test.js`

**Interfaces:**
- Produces:
  - `selectRecoveryCandidates(orders, now = new Date(), { minHours = 6, maxHours = 48 } = {}) -> Order[]` — 回 `status==='pending'`、`recovery_sent_at` 空、`email` 非空、`created_at` 落在 `[now-maxHours, now-minHours]` 的訂單。
  - `buildRecoveryEmail({ planLabel }) -> { subject, html }` — 繁中提醒信；`planLabel` 經 HTML 跳脫；含 verbatim CTA 連結。

- [ ] **Step 1: 寫失敗測試**

Create `lib/recovery.test.js`:

```js
import { describe, it, expect } from "vitest";
import { selectRecoveryCandidates, buildRecoveryEmail } from "./recovery.js";

const now = new Date("2026-07-27T12:00:00Z");
const iso = (hoursAgo) => new Date(now.getTime() - hoursAgo * 3600 * 1000).toISOString();
const base = { status: "pending", email: "a@b.com", recovery_sent_at: null };

describe("selectRecoveryCandidates", () => {
  it("選中時間窗(6-48h)內、未寄過的 pending", () => {
    const r = selectRecoveryCandidates([{ ...base, id: 1, created_at: iso(7) }], now);
    expect(r.map((o) => o.id)).toEqual([1]);
  });
  it("排除太新(<6h)與太舊(>48h)", () => {
    const r = selectRecoveryCandidates([
      { ...base, id: 1, created_at: iso(3) },
      { ...base, id: 2, created_at: iso(50) },
      { ...base, id: 3, created_at: iso(24) },
    ], now);
    expect(r.map((o) => o.id)).toEqual([3]);
  });
  it("排除非 pending / 已寄過 / 無 email", () => {
    const r = selectRecoveryCandidates([
      { ...base, id: 1, created_at: iso(7), status: "paid" },
      { ...base, id: 2, created_at: iso(7), recovery_sent_at: iso(1) },
      { ...base, id: 3, created_at: iso(7), email: null },
    ], now);
    expect(r).toEqual([]);
  });
  it("空輸入不炸", () => expect(selectRecoveryCandidates(null, now)).toEqual([]));
});

describe("buildRecoveryEmail", () => {
  it("含方案名與帶 UTM 的 CTA", () => {
    const { subject, html } = buildRecoveryEmail({ planLabel: "學琴全攻略" });
    expect(subject).toContain("還沒完成");
    expect(html).toContain("學琴全攻略");
    expect(html).toContain("utm_campaign=abandoned_recovery");
  });
  it("跳脫 planLabel 中的 HTML（防注入）", () => {
    const { html } = buildRecoveryEmail({ planLabel: "<script>x</script>" });
    expect(html).not.toContain("<script>x");
    expect(html).toContain("&lt;script&gt;");
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run lib/recovery.test.js`
Expected: FAIL（模組未建立）。

- [ ] **Step 3: 實作**

Create `lib/recovery.js`:

```js
// lib/recovery.js — 未成交挽回信：純函式（候選篩選 + 信件內容）

// 未付款、落在挽回時間窗、尚未寄過、且有 email 的訂單
export function selectRecoveryCandidates(orders, now = new Date(), { minHours = 6, maxHours = 48 } = {}) {
  const t = now.getTime();
  const minMs = minHours * 3600 * 1000;
  const maxMs = maxHours * 3600 * 1000;
  return (orders || []).filter((o) => {
    if (!o || o.status !== "pending" || o.recovery_sent_at || !o.email) return false;
    const created = new Date(o.created_at).getTime();
    if (!Number.isFinite(created)) return false;
    const age = t - created;
    return age >= minMs && age <= maxMs;
  });
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

const RECOVERY_CTA = "https://inrecordmusic.com/?utm_source=email&utm_medium=email&utm_campaign=abandoned_recovery#pricing";

export function buildRecoveryEmail({ planLabel } = {}) {
  const label = escapeHtml(planLabel || "課程");
  const subject = "你的 InRecord 課程訂單還沒完成 🎹";
  const html = `<div style="font-family:-apple-system,'Noto Sans TC',sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
  <h2 style="font-size:20px">訂單還沒完成 🎹</h2>
  <p>嗨，你先前選了「<strong>${label}</strong>」但還沒完成付款。名額有限，別錯過～</p>
  <p style="text-align:center;margin:28px 0">
    <a href="${RECOVERY_CTA}" style="display:inline-block;background:#2563eb;color:#fff;font-weight:700;padding:12px 28px;border-radius:10px;text-decoration:none">回去完成購買</a>
  </p>
  <p style="color:#64748b;font-size:13px">有任何問題歡迎回信或聯絡客服 service@inrecordmusic.com。若你已完成購買、或不想再收到此提醒，回信告訴我們即可。</p>
</div>`;
  return { subject, html };
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run lib/recovery.test.js`
Expected: PASS（6 tests 綠）。

- [ ] **Step 5: Commit**

```bash
git add lib/recovery.js lib/recovery.test.js
git commit -m "feat(recovery): candidate selection and reminder email content"
```

---

## Task 3: Cron 路由 + vercel.json 排程

**Files:**
- Create: `app/api/cron/abandoned-recovery/route.js`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `selectRecoveryCandidates` / `buildRecoveryEmail`（Task 2）；`getSupabaseAdmin`；`sendNewsletterEmail`（`@/lib/brevo-email`，既有）。
- Produces: `GET /api/cron/abandoned-recovery`（Bearer `CRON_SECRET`）→ 掃 pending → 原子 claim → 寄信 → `{ ok, scanned, sent, failed, minHours, maxHours }`。

- [ ] **Step 1: 實作 cron**

Create `app/api/cron/abandoned-recovery/route.js`:

```js
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { selectRecoveryCandidates, buildRecoveryEmail } from "@/lib/recovery";
import { sendNewsletterEmail } from "@/lib/brevo-email";

// 未成交挽回信 cron（比照 release-coupons）
// 觸發：Vercel Cron（自動帶 Authorization: Bearer <CRON_SECRET>）或手動 curl。
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const minHours = Number(process.env.RECOVERY_AFTER_HOURS || 6);
  const maxHours = Number(process.env.RECOVERY_MAX_HOURS || 48);

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "no_db" }, { status: 500 });

  const now = new Date();
  const minCutoff = new Date(now.getTime() - minHours * 3600 * 1000).toISOString(); // 早於此＝已滿 minHours
  const maxCutoff = new Date(now.getTime() - maxHours * 3600 * 1000).toISOString(); // 晚於此＝未超過 maxHours

  const { data: rows, error } = await supabase
    .from("orders")
    .select("id, email, plan_label, created_at, status, recovery_sent_at")
    .eq("status", "pending")
    .is("recovery_sent_at", null)
    .lt("created_at", minCutoff)
    .gt("created_at", maxCutoff)
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const candidates = selectRecoveryCandidates(rows, now, { minHours, maxHours });

  let sent = 0;
  let failed = 0;
  for (const o of candidates) {
    // 原子 claim：只在仍 pending 且未寄過時成功（防重寄＋防與 notify 競態）
    const { data: claimed } = await supabase
      .from("orders")
      .update({ recovery_sent_at: new Date().toISOString() })
      .eq("id", o.id)
      .eq("status", "pending")
      .is("recovery_sent_at", null)
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    const { subject, html } = buildRecoveryEmail({ planLabel: o.plan_label });
    const r = await sendNewsletterEmail({ to: o.email, subject, html, kind: "recovery" });
    if (r?.success) {
      sent++;
    } else {
      failed++;
      // 寄失敗還原旗標，下輪重試
      await supabase.from("orders").update({ recovery_sent_at: null }).eq("id", o.id);
    }
  }

  return NextResponse.json({ ok: true, scanned: candidates.length, sent, failed, minHours, maxHours });
}
```

- [ ] **Step 2: 加進 vercel.json 排程**

Modify `vercel.json`：在 `crons` 陣列加一項（每小時）：

```json
    { "path": "/api/cron/abandoned-recovery", "schedule": "0 * * * *" }
```

加完 `crons` 應長這樣：
```json
  "crons": [
    { "path": "/api/cron/release-coupons", "schedule": "0 4 * * *" },
    { "path": "/api/cron/sale-launch-notify", "schedule": "5 4 * * *" },
    { "path": "/api/cron/abandoned-recovery", "schedule": "0 * * * *" }
  ]
```
> ⚠️ 若正式站 Vercel 為 Hobby 方案（cron 上限 2 個／每日），此第 3 個每小時 cron 會被拒 → 部署時改每日 `"0 * * * *"→"30 4 * * *"` 或升級 Pro。實作階段照上面每小時寫，deploy 時 controller 依方案定奪。

- [ ] **Step 3: 驗證（build + 既有測試不破）**

Run: `npm test`
Expected: 既有全套仍綠（本 task 無新單元測試；cron 屬整合，真跑驗證於部署階段）。

Run: `npm run build`
Expected: build 成功（新 route 編譯過）。

> 手動端到端（部署後）：造一筆 `status='pending'`、`created_at` 調到 7h 前、有 email 的訂單 → `curl -H "Authorization: Bearer $CRON_SECRET" https://inrecordmusic.com/api/cron/abandoned-recovery` → 回 `sent:1`、該筆 `recovery_sent_at` 有值；再打一次 `sent:0`（不重寄）；把該筆改 `paid` → 不寄。未帶 secret → 401。

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/abandoned-recovery/route.js vercel.json
git commit -m "feat(recovery): hourly cron to send abandoned-payment reminder emails"
```

---

## 收尾驗證（全部任務後）

- [ ] `npm test` 全綠（含 `lib/recovery.test.js`）。
- [ ] `npm run build` 成功。
- [ ] 部署後安全閘：cron 未帶 `CRON_SECRET` → 401。
- [ ] 造測試 pending（7h 前）→ 打 cron → 寄一次 + 旗標 set；再打不重寄；改 paid 不寄。
- [ ] 幾天後看後臺「來源歸因表」是否出現 `abandoned_recovery` 來源（挽回成效）。

## 部署

```bash
# 1) SQL 先行（additive）——由 controller 套正式 DB(vmslzbcegfljlopkewpx)
#    alter table orders add column if not exists recovery_sent_at timestamptz;
# 2) 推 + 部署
git rev-parse --abbrev-ref HEAD
gh auth switch --user inrecmusic
git push
npx vercel --prod
# 3) 確認 Vercel 方案支援第 3 個/每小時 cron；不支援則調排程或升級
# 4) CLAUDE.md：把 supabase-recovery.sql 加進部署 SQL runbook、cron 表加一列
```
