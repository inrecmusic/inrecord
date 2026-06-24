# 後台粉絲限定方案設定 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓營運者在後台「銷售設定」即時調整粉絲限定方案的啟用開關／截止日／粉絲價／直購價，免改 code 部署。

**Architecture:** 擴充 `sale_settings` 加 `fan_plan JSONB`。`lib/fan-proof.js` 純函式改成接受參數（截止日、價格），`lib/sale.js` 加 `getFanPlan` 正規化（缺值 fallback 到現狀常數）。`/api/fan-proof`、前台 `HomeClient` 改讀 `fan_plan`；`sale-settings` PATCH 驗證 `fan_plan` 並同步 DB 的 `FAN3999` 直購券。`enabled=false` 三層擋（前台不顯示卡 + API 403 + 券 disabled）。

**Tech Stack:** Next.js 14 App Router、Supabase(Postgres)、vitest（node env，純函式測試）、既有 `lib/sale.js`／`lib/fan-proof.js`／`lib/plans.js`。

## Global Constraints

- 回覆與 UI 文案一律**繁體中文**。
- 工作目錄 **`~/code/inrecord`**（已從 GitHub 重新 clone；舊 `~/Desktop`／`~/Documents` 路徑作廢、受 macOS TCC 擋勿用）。
- git：先確認 `git branch --show-current` = `feat/point2-carousel`；每次 commit **只 stage 該 task 明確列出的檔案**，禁用 `git add -A`。
- gh：push 前 `gh auth switch --user inrecmusic`（本 session 已切；雙帳號預設 alanchou0825 會推不上去）。
- 價格權威在後端；`fan_plan` 預設值（DB 為 `'{}'` 時）由 `getFanPlan` fallback = **現狀**（enabled=true、截止 2026-08-06、粉絲價 3499、直購價 3999）→ 上線後行為不變，直到後台改。
- 純函式測 vitest（`npx vitest run <file>`）；route/UI 以 `npx next build` 編譯 + 手動／半自動 e2e 驗證。
- **不動** `app/api/payuni/notify/route.js` 與金流加解密（`lib/payuni.js`）。
- 粉絲憑證價券 = 一次性 `FAN-xxx`（fan-proof 動態發，value=proof_price）；直購券 = 固定一張 `FAN3999`（value=direct_price，後台同步）。

---

## File Structure

- **Modify `supabase-deploy.sql`** — 加 `sale_settings.fan_plan JSONB` 欄位（idempotent）。
- **Modify `lib/fan-proof.js`** — `isFanProofOpen`/`buildFanCoupon` 接受參數；加 `FAN_DIRECT_PRICE` 常數。
- **Modify `lib/fan-proof.test.js`** — append 帶參數的測試。
- **Modify `lib/sale.js`** — 加 `getFanPlan`、`validateFanPlan`；`salePhase` 併入 `fanPlan`。
- **Modify `lib/sale.test.js`** — `getFanPlan`/`validateFanPlan` 測試。
- **Modify `app/api/fan-proof/route.js`** — 讀 `fan_plan`：enabled+deadline gate、發券價。
- **Modify `app/api/admin/sale-settings/route.js`** — PATCH 驗證 `fan_plan` + 同步 `FAN3999` 券。
- **Modify `app/page.jsx`** — `sale` 物件併入 `fanPlan`。
- **Modify `app/HomeClient.jsx`** — 粉絲卡讀 `sale.fanPlan`（enabled 控整卡、deadline 控憑證入口、價格文案讀值）。
- **Modify `app/admin/SaleSettingsPage.jsx`** — 加「粉絲限定方案」設定區塊。

---

## Task 1：DB 欄位 + `lib/fan-proof.js` 純函式接受參數

**Files:**
- Modify: `supabase-deploy.sql`（sale_settings 區塊，找 `ALTER TABLE sale_settings ADD COLUMN IF NOT EXISTS list_anchor` 附近）
- Modify: `lib/fan-proof.js`
- Test: `lib/fan-proof.test.js`（append）

**Interfaces:**
- Produces:
  - `FAN_DIRECT_PRICE = 3999`（新常數）
  - `isFanProofOpen(now = new Date(), deadline = FAN_PROOF_DEADLINE) → boolean`（deadline 可為 ms number 或可 `Date.parse` 字串）
  - `buildFanCoupon({ code, now = new Date(), price = FAN_PRICE }) → coupon object`

- [ ] **Step 1：append 失敗測試** 到 `lib/fan-proof.test.js` 末尾

```js
describe("isFanProofOpen 帶 deadline 參數", () => {
  const dlStr = "2026-09-03T23:59:59+08:00";
  it("自訂 deadline(字串)：截止前 true、截止後 false", () => {
    expect(isFanProofOpen(new Date("2026-09-01T00:00:00+08:00"), dlStr)).toBe(true);
    expect(isFanProofOpen(new Date("2026-09-04T00:00:00+08:00"), dlStr)).toBe(false);
  });
  it("自訂 deadline(ms number)", () => {
    const dl = Date.parse(dlStr);
    expect(isFanProofOpen(new Date("2026-09-01T00:00:00+08:00"), dl)).toBe(true);
    expect(isFanProofOpen(new Date("2026-09-04T00:00:00+08:00"), dl)).toBe(false);
  });
});

describe("buildFanCoupon 帶 price 參數", () => {
  it("自訂 price 寫進 value", () => {
    expect(buildFanCoupon({ code: "FANX1234", price: 3299 })).toMatchObject({ value: 3299, type: "price", plan: "bundle", usage_limit: 1 });
  });
  it("不帶 price 用 FAN_PRICE 預設", () => {
    expect(buildFanCoupon({ code: "FANX1234" }).value).toBe(FAN_PRICE);
  });
});

describe("FAN_DIRECT_PRICE 常數", () => {
  it("= 3999", () => { expect(FAN_DIRECT_PRICE).toBe(3999); });
});
```

並確認 import 行涵蓋 `FAN_DIRECT_PRICE`（把檔案頂部既有 import 改為）：
```js
import { isFanProofOpen, buildFanCoupon, FAN_PRICE, FAN_PROOF_DEADLINE, FAN_DIRECT_PRICE } from "./fan-proof.js";
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npx vitest run lib/fan-proof.test.js`
Expected: FAIL（`FAN_DIRECT_PRICE` undefined / 帶第二參數的 deadline 未生效）

- [ ] **Step 3：改 `lib/fan-proof.js`**

把現有 `FAN_PRICE`/`FAN_PLAN`/`FAN_PROOF_DEADLINE` 常數區塊之後加上 `FAN_DIRECT_PRICE`，並改寫 `isFanProofOpen`、`buildFanCoupon`：

```js
export const FAN_PRICE = 3499;          // 憑證折扣後成交價（type='price'）
export const FAN_DIRECT_PRICE = 3999;   // 直購價（FAN3999 券預設 value）
export const FAN_PLAN = "bundle";       // 僅課程包適用
// 申請截止 fallback 預設：2026-08-06 23:59:59（台灣 UTC+8）
export const FAN_PROOF_DEADLINE = Date.parse("2026-08-06T23:59:59+08:00");

export function isFanProofOpen(now = new Date(), deadline = FAN_PROOF_DEADLINE) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const d = typeof deadline === "number" ? deadline : Date.parse(deadline);
  return t <= d;
}

export function buildFanCoupon({ code, now = new Date(), price = FAN_PRICE }) {
  return {
    name: "粉絲憑證折價",
    code,
    type: "price",
    value: price,
    plan: FAN_PLAN,
    usage_limit: 1,
    status: "active",
    starts_at: null,
    ends_at: null,
  };
}
```

（`isOwnProofUrl` 不動。`now` 參數保留是為了既有呼叫相容；`now` 未用到時忽略即可。）

- [ ] **Step 4：跑測試確認通過**

Run: `npx vitest run lib/fan-proof.test.js`
Expected: PASS（既有測試 + 新增 case 全綠）

- [ ] **Step 5：加 DB 欄位到 `supabase-deploy.sql`**

在 `sale_settings` 的 `ALTER TABLE sale_settings ADD COLUMN IF NOT EXISTS list_anchor ...` 那行附近加入：

```sql
-- 粉絲限定方案後台設定（enabled/deadline/proof_price/direct_price），缺值由 getFanPlan fallback
ALTER TABLE sale_settings ADD COLUMN IF NOT EXISTS fan_plan JSONB NOT NULL DEFAULT '{}'::jsonb;
```

- [ ] **Step 6：Commit**

```bash
git add lib/fan-proof.js lib/fan-proof.test.js supabase-deploy.sql
git commit -m "feat(fan): fan-proof 純函式接受 deadline/price 參數 + sale_settings.fan_plan 欄位"
```

---

## Task 2：`lib/sale.js` 的 `getFanPlan` / `validateFanPlan` + `salePhase` 併 fanPlan

**Files:**
- Modify: `lib/sale.js`
- Test: `lib/sale.test.js`（append）

**Interfaces:**
- Consumes: `FAN_PRICE`、`FAN_DIRECT_PRICE`、`FAN_PROOF_DEADLINE`（Task 1）
- Produces:
  - `getFanPlan(settings) → { enabled:boolean, deadlineMs:number, proofPrice:number, directPrice:number }`
  - `validateFanPlan(fp) → { ok:true } | { ok:false, error:string }`
  - `salePhase(...)` 回傳物件多一個 `fanPlan`（= `getFanPlan(settings)`）

- [ ] **Step 1：append 失敗測試** 到 `lib/sale.test.js`

```js
import { getFanPlan, validateFanPlan } from "./sale.js";
import { FAN_PRICE, FAN_DIRECT_PRICE, FAN_PROOF_DEADLINE } from "./fan-proof.js";

describe("getFanPlan", () => {
  it("完整值原樣正規化", () => {
    const s = { fan_plan: { enabled: false, deadline: "2026-09-03T23:59:59+08:00", proof_price: 3299, direct_price: 3799 } };
    expect(getFanPlan(s)).toEqual({ enabled: false, deadlineMs: Date.parse("2026-09-03T23:59:59+08:00"), proofPrice: 3299, directPrice: 3799 });
  });
  it("空物件 → 全部 fallback（enabled 預設 true）", () => {
    expect(getFanPlan({ fan_plan: {} })).toEqual({ enabled: true, deadlineMs: FAN_PROOF_DEADLINE, proofPrice: FAN_PRICE, directPrice: FAN_DIRECT_PRICE });
  });
  it("null settings 不爆、enabled 預設 true", () => {
    expect(getFanPlan(null).enabled).toBe(true);
  });
  it("壞 deadline 字串 → fallback 預設", () => {
    expect(getFanPlan({ fan_plan: { deadline: "not-a-date" } }).deadlineMs).toBe(FAN_PROOF_DEADLINE);
  });
});

describe("validateFanPlan", () => {
  const good = { enabled: true, deadline: "2026-08-06T23:59:59+08:00", proof_price: 3499, direct_price: 3999 };
  it("合法 → ok", () => { expect(validateFanPlan(good)).toEqual({ ok: true }); });
  it("enabled 非 boolean → error", () => { expect(validateFanPlan({ ...good, enabled: "yes" }).ok).toBe(false); });
  it("deadline 不可 parse → error", () => { expect(validateFanPlan({ ...good, deadline: "x" }).ok).toBe(false); });
  it("proof_price 非正整數 → error", () => { expect(validateFanPlan({ ...good, proof_price: 0 }).ok).toBe(false); });
  it("proof > direct → error", () => { expect(validateFanPlan({ ...good, proof_price: 4000 }).ok).toBe(false); });
});
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npx vitest run lib/sale.test.js`
Expected: FAIL（`getFanPlan`/`validateFanPlan` 未定義）

- [ ] **Step 3：改 `lib/sale.js`**

頂部 import 加入 fan 常數：
```js
import { FAN_PRICE, FAN_DIRECT_PRICE, FAN_PROOF_DEADLINE } from "./fan-proof.js";
```

在 `getSaleSettings` 之前加入兩個純函式：
```js
// 粉絲方案設定正規化：缺/壞值 fallback 到 lib/fan-proof 常數（enabled 預設 true）
export function getFanPlan(settings) {
  const fp = (settings && typeof settings.fan_plan === "object" && settings.fan_plan) || {};
  const enabled = typeof fp.enabled === "boolean" ? fp.enabled : true;
  const deadlineMs = fp.deadline && !isNaN(Date.parse(fp.deadline)) ? Date.parse(fp.deadline) : FAN_PROOF_DEADLINE;
  const proofPrice = Number.isInteger(fp.proof_price) && fp.proof_price > 0 ? fp.proof_price : FAN_PRICE;
  const directPrice = Number.isInteger(fp.direct_price) && fp.direct_price > 0 ? fp.direct_price : FAN_DIRECT_PRICE;
  return { enabled, deadlineMs, proofPrice, directPrice };
}

// 後台 PATCH 用的輸入驗證（不信任前端）
export function validateFanPlan(fp) {
  if (typeof fp !== "object" || fp === null) return { ok: false, error: "invalid_fan_plan" };
  if (typeof fp.enabled !== "boolean") return { ok: false, error: "invalid_fan_plan_enabled" };
  if (!fp.deadline || isNaN(Date.parse(fp.deadline))) return { ok: false, error: "invalid_fan_plan_deadline" };
  if (!Number.isInteger(fp.proof_price) || fp.proof_price <= 0) return { ok: false, error: "invalid_fan_plan_proof_price" };
  if (!Number.isInteger(fp.direct_price) || fp.direct_price <= 0) return { ok: false, error: "invalid_fan_plan_direct_price" };
  if (fp.proof_price > fp.direct_price) return { ok: false, error: "fan_plan_proof_gt_direct" };
  return { ok: true };
}
```

在 `salePhase` 的 `return { ... }` 物件尾端加入 `fanPlan`：
```js
  return {
    state,
    classroomOpen: isClassroomOpen(settings, now),
    onSale: state !== "pre_launch",
    salesStartAt: ws.length ? ws[0].starts_at : null,
    nextIncreaseAt: w ? w.ends_at : null,
    plans,
    fanPlan: getFanPlan(settings),
  };
```

- [ ] **Step 4：跑測試確認通過**

Run: `npx vitest run lib/sale.test.js`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add lib/sale.js lib/sale.test.js
git commit -m "feat(fan): lib/sale getFanPlan/validateFanPlan + salePhase 併 fanPlan"
```

---

## Task 3：`/api/fan-proof` 讀 fan_plan（enabled+截止 gate、發券價）

**Files:**
- Modify: `app/api/fan-proof/route.js`

**Interfaces:**
- Consumes: `getSaleSettings`/`getFanPlan`（Task 2）、`isFanProofOpen`/`buildFanCoupon`（Task 1）

- [ ] **Step 1：改 import + gate + 發券價**

頂部 import 改為（加 `getSaleSettings, getFanPlan`）：
```js
import { isFanProofOpen, buildFanCoupon } from "@/lib/fan-proof";
import { getSaleSettings, getFanPlan } from "@/lib/sale";
```

把現有「1) 截止 gate」段（`if (!isFanProofOpen()) { ... }`）替換為：
```js
  // 1) 讀後台粉絲設定：先檢查 enabled，再檢查截止
  const fanPlan = getFanPlan(await getSaleSettings());
  if (!fanPlan.enabled) {
    return Response.json({ ok: false, error: "disabled" }, { status: 403 });
  }
  if (!isFanProofOpen(new Date(), fanPlan.deadlineMs)) {
    return Response.json({ ok: false, error: "closed" }, { status: 403 });
  }
```

把發券那行 `buildFanCoupon({ code })` 改為：
```js
    const { error } = await supabase.from("coupons").insert(buildFanCoupon({ code, price: fanPlan.proofPrice }));
```

- [ ] **Step 2：驗證編譯**

Run: `npx next build`
Expected: `✓ Compiled successfully`，route `/api/fan-proof` 出現

- [ ] **Step 3：Commit**

```bash
git add app/api/fan-proof/route.js
git commit -m "feat(fan): /api/fan-proof 讀後台 fan_plan(enabled+截止 gate、發券價)"
```

---

## Task 4：`sale-settings` PATCH 驗證 fan_plan + 同步 FAN3999 券

**Files:**
- Modify: `app/api/admin/sale-settings/route.js`

**Interfaces:**
- Consumes: `validateFanPlan`（Task 2）
- 行為：PATCH body 有 `fan_plan` 時驗證→寫入；成功寫 settings 後 upsert `coupons` 的 `FAN3999`（value=direct_price、status 依 enabled）。GET 為 `select("*")` 已含 `fan_plan`，免改。

- [ ] **Step 1：import `validateFanPlan`**

頂部 import 改為：
```js
import { validateFanPlan } from "@/lib/sale";
```
（與既有 `import { PLAN_CATALOG } from "@/lib/plans";` 並列；`validateFanPlan` 來自 `@/lib/sale`，需新增該 import 行。）

- [ ] **Step 2：PATCH 內加 fan_plan 驗證**

在 `if ("waves" in body) { ... }` 區塊之後、`const { data, error } = await sb.from("sale_settings").upsert(...)` 之前，加入：
```js
  if ("fan_plan" in body) {
    const v = validateFanPlan(body.fan_plan);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    patch.fan_plan = body.fan_plan;
  }
```

- [ ] **Step 3：寫 settings 後同步 FAN3999 券**

把結尾的 upsert + return 段改為（寫完 settings 後，若有 fan_plan 則同步券）：
```js
  const { data, error } = await sb.from("sale_settings")
    .upsert(patch, { onConflict: "id" }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 同步直購固定價券 FAN3999（value=direct_price，enabled=false 時 disabled）
  if ("fan_plan" in body) {
    const fp = body.fan_plan;
    const { error: cErr } = await sb.from("coupons").upsert({
      code: "FAN3999",
      name: "粉絲直購",
      type: "price",
      value: fp.direct_price,
      plan: "bundle",
      usage_limit: null,
      status: fp.enabled ? "active" : "disabled",
    }, { onConflict: "code" });
    if (cErr) return NextResponse.json({ error: "fan_coupon_sync_failed: " + cErr.message }, { status: 500 });
  }

  return NextResponse.json({ data });
```

- [ ] **Step 4：驗證編譯**

Run: `npx next build`
Expected: `✓ Compiled successfully`

- [ ] **Step 5：Commit**

```bash
git add app/api/admin/sale-settings/route.js
git commit -m "feat(fan): sale-settings PATCH 驗證 fan_plan + 同步 FAN3999 直購券"
```

---

## Task 5：`page.jsx` + `HomeClient` 前台讀 fanPlan

**Files:**
- Modify: `app/page.jsx`（sale 物件，line 11-18）
- Modify: `app/HomeClient.jsx`（粉絲卡 line 759-787）

**Interfaces:**
- Consumes: `salePhase` 回傳的 `fanPlan`（Task 2）、`isFanProofOpen`（Task 1，HomeClient 已 import）

- [ ] **Step 1：`app/page.jsx` 的 sale 物件加 fanPlan**

把 `const sale = { ... }` 改為（尾端加 `fanPlan`）：
```js
  const sale = {
    state: phase.state,
    onSale: phase.onSale,
    classroomOpen: phase.classroomOpen,
    salesStartAt: phase.salesStartAt,
    nextIncreaseAt: phase.nextIncreaseAt,
    plans: phase.plans,
    fanPlan: phase.fanPlan,
  };
```

- [ ] **Step 2：`HomeClient` 粉絲卡改讀 sale.fanPlan**

在 `HomeClient` 元件內、`return` 之前，加一行算出憑證是否開放（找 `const presaleMode = !sale.classroomOpen;` 附近加）：
```js
  const fanProofOpen = isFanProofOpen(Date.now(), sale.fanPlan.deadlineMs);
  const fanDeadlineLabel = new Date(sale.fanPlan.deadlineMs).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" });
```

把粉絲卡整段（從 `{isFanProofOpen() && (` 到對應的 `)}`，即 line 760-787）替換為：
```jsx
              {/* 粉絲限定方案：enabled 控整卡；截止後只關憑證入口、直購仍可 */}
              {sale.fanPlan.enabled && (
              <motion.div className={[styles.planCard, styles.planCardFeatured].join(" ")} variants={fadeUp}>
                <div className={styles.planRibbon}>★ 粉絲限定</div>
                <h3 className={styles.planName}>粉絲限定方案</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "4px 0 14px" }} role="radiogroup" aria-label="粉絲限定購買方式">
                  <label style={fanRowStyle(fanChoice === "direct" || !fanProofOpen)} onClick={() => setFanChoice("direct")} role="radio" aria-checked={fanChoice === "direct" || !fanProofOpen} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFanChoice("direct"); } }}>
                    <span>直接購買</span>
                    <strong>NT${sale.fanPlan.directPrice.toLocaleString()}</strong>
                  </label>
                  {fanProofOpen && (
                  <label style={fanRowStyle(fanChoice === "proof")} onClick={() => setFanChoice("proof")} role="radio" aria-checked={fanChoice === "proof"} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFanChoice("proof"); } }}>
                    <span>上傳憑證</span>
                    <strong>NT${sale.fanPlan.proofPrice.toLocaleString()}</strong>
                  </label>
                  )}
                </div>
                {fanProofOpen && (
                <div style={{ fontSize: 12.5, color: "#566180", background: "#eef4ff", border: "1px solid #cdddf8", borderRadius: 10, padding: "10px 12px", margin: "2px 0 14px", lineHeight: 1.75, wordBreak: "keep-all", lineBreak: "strict" }}>
                  ※ 購買演奏會門票、專輯或樂譜者，上傳憑證後即可用 NT${sale.fanPlan.proofPrice.toLocaleString()} 購買。
                </div>
                )}
                <ul className={styles.planFeatures}>
                  {PLANS[1].features.map(f => <li key={f}><Check size={14} strokeWidth={2.5} />{f}</li>)}
                </ul>
                <button className={`${styles.planBtn} ${styles.planBtnFeatured}`}
                  onClick={() => (fanChoice === "proof" && fanProofOpen) ? startBuy(PLANS[1], { fanProof: true }) : startBuy(PLANS[1], { autoCoupon: "FAN3999" })}>
                  <ShoppingCart size={17} />
                  {(fanChoice === "proof" && fanProofOpen) ? `上傳憑證並${buyShort}　NT$${sale.fanPlan.proofPrice.toLocaleString()}` : `${buyShort}　NT$${sale.fanPlan.directPrice.toLocaleString()}`}
                </button>
                {fanProofOpen && <span style={{ fontSize: 11.5, color: "#6a5b48", marginTop: 8, display: "block", textAlign: "center" }}>粉絲價申請至 {fanDeadlineLabel} 截止</span>}
              </motion.div>
              )}
```

- [ ] **Step 3：驗證編譯**

Run: `npx next build`
Expected: `✓ Compiled successfully`

- [ ] **Step 4：Commit**

```bash
git add app/page.jsx app/HomeClient.jsx
git commit -m "feat(fan): 前台粉絲卡改讀 sale.fanPlan(enabled/截止/價格即時生效)"
```

---

## Task 6：後台 `SaleSettingsPage` 加「粉絲限定方案」設定區塊

**Files:**
- Modify: `app/admin/SaleSettingsPage.jsx`

**Interfaces:**
- 行為：載入時 `s.fan_plan` 可能為 `{}`（DB default）→ UI 以 fallback 顯示（enabled 預設勾選、截止 2026-08-06、粉絲價 3499、直購價 3999）。`save()` body 併入完整 `fan_plan`。

- [ ] **Step 1：`EMPTY_SETTINGS` 加 fan_plan**

把 `const EMPTY_SETTINGS = {...}` 改為尾端加 `fan_plan: {}`：
```js
const EMPTY_SETTINGS = { open_at: null, lock_override: null, launch_notified_at: null, list_price: {}, list_anchor: {}, waves: [], fan_plan: {} };
```

- [ ] **Step 2：元件內加 fanPlan 正規化(顯示用)**

在 `if (loading || !s) return ...` 之後、`const setWave = ...` 之前加：
```js
  const fp = s.fan_plan || {};
  const fanEnabled = typeof fp.enabled === "boolean" ? fp.enabled : true;
  const fanDeadline = fp.deadline || "2026-08-06T23:59:59+08:00";
  const fanProofPrice = Number.isInteger(fp.proof_price) ? fp.proof_price : 3499;
  const fanDirectPrice = Number.isInteger(fp.direct_price) ? fp.direct_price : 3999;
  const setFan = (key, val) => setS((prev) => ({ ...prev, fan_plan: { enabled: fanEnabled, deadline: fanDeadline, proof_price: fanProofPrice, direct_price: fanDirectPrice, [key]: val } }));
```

- [ ] **Step 3：`save()` body 加 fan_plan**

把 `save` 內 `body: JSON.stringify({ ... })` 改為加入完整 `fan_plan`：
```js
        body: JSON.stringify({
          open_at: s.open_at, lock_override: s.lock_override,
          list_price: s.list_price || {}, list_anchor: s.list_anchor || {}, waves: s.waves || [],
          fan_plan: { enabled: fanEnabled, deadline: fanDeadline, proof_price: fanProofPrice, direct_price: fanDirectPrice },
        }),
```

- [ ] **Step 4：加 UI 區塊**

在「手動覆寫」`<label>` 區塊之前（即 `<label style={field}>手動覆寫` 那行前）插入：
```jsx
      <div style={{ ...field, padding: 12, border: "1px solid #e2e8f0", borderRadius: 10 }}>
        <strong>粉絲限定方案</strong><br />
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, margin: "8px 0" }}>
          <input type="checkbox" checked={fanEnabled} onChange={(e) => setFan("enabled", e.target.checked)} />
          啟用粉絲限定方案（取消勾選＝整張卡收起、上傳入口關閉、直購券停用）
        </label><br />
        <label style={{ marginRight: 16 }}>憑證申請截止
          <br /><input type="datetime-local" style={input} value={toLocalInput(fanDeadline)}
            onChange={(e) => setFan("deadline", fromLocalInput(e.target.value))} />
        </label><br />
        <span style={{ marginRight: 16, display: "inline-block", marginTop: 8 }}>粉絲價 NT$
          <input type="number" min="0" style={input} value={fanProofPrice}
            onChange={(e) => setFan("proof_price", e.target.value === "" ? 0 : Number(e.target.value))} />
        </span>
        <span style={{ display: "inline-block", marginTop: 8 }}>直購價 NT$
          <input type="number" min="0" style={input} value={fanDirectPrice}
            onChange={(e) => setFan("direct_price", e.target.value === "" ? 0 : Number(e.target.value))} />
        </span>
        <p style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>粉絲價 ≤ 直購價；改直購價會同步更新 FAN3999 券。截止後只關上傳入口，直購仍可。</p>
      </div>
```

- [ ] **Step 5：驗證編譯**

Run: `npx next build`
Expected: `✓ Compiled successfully`

- [ ] **Step 6：Commit**

```bash
git add app/admin/SaleSettingsPage.jsx
git commit -m "feat(fan): 後台銷售設定加『粉絲限定方案』區塊(開關/截止/粉絲價/直購價)"
```

---

## Task 7：端到端驗證 + 部署

**Files:** 無（驗證 + 部署）

- [ ] **Step 1：全測試 + 編譯**

Run: `npx vitest run && npx next build`
Expected: 測試全綠（含 Task 1/2 新增）、build `✓ Compiled successfully`

- [ ] **Step 2：部署（需使用者授權）**

```bash
git push
npx vercel --prod --yes
```
（push 前 `gh auth switch --user inrecmusic`；`vercel --prod` 屬正式部署，向使用者確認後執行。）

- [ ] **Step 3：正式站 Supabase 補跑 SQL**

於 Supabase SQL Editor（專案 `vmslzbcegfljlopkewpx`）執行：
```sql
ALTER TABLE sale_settings ADD COLUMN IF NOT EXISTS fan_plan JSONB NOT NULL DEFAULT '{}'::jsonb;
```

- [ ] **Step 4：端到端手測 / 半自動**

1. 後台 `/admin` →「銷售設定」→ 粉絲限定方案：改粉絲價 3399、直購價 3899、截止日 → 儲存。
2. 前台首頁（等 ISR ~60s 或重新部署）→ 粉絲卡顯示 NT$3,899 / NT$3,399、截止日文字更新。
3. 用既有半自動 e2e 模式驗：fan-proof 發券 `value === 3399`、checkout 成交 3399。
4. DB 查 `coupons` 的 `FAN3999` → `value === 3899`、`status==='active'`。
5. 後台取消「啟用」→ 儲存 → 前台粉絲卡消失、`/api/fan-proof` 回 403 `disabled`、`FAN3999` 券 `status==='disabled'`。
6. 把截止日設為過去 → 前台粉絲卡只剩「直接購買」、直購仍可結帳。

- [ ] **Step 5：恢復測試值**

把後台粉絲設定改回正式值（enabled、截止 2026-08-06、粉絲價 3499、直購價 3999）並儲存。

---

## Verification（端到端）

1. `npx vitest run` 全綠（fan-proof / sale 新增測試含 deadline/price/getFanPlan/validateFanPlan）。
2. `npx next build` 成功。
3. 正式 Supabase `sale_settings.fan_plan` 欄位存在。
4. 後台改四項 → 前台即時反映、FAN3999 券同步、enabled=false 三層擋、截止後只關憑證入口。

## 風險 / 備註

- `FAN3999` 券同步是雙寫（settings + coupons）：PATCH 先寫 settings 再 upsert 券，券失敗回 500、不靜默。
- 改 `proof_price` 只影響之後新發的一次性券（已發舊券 value 不回溯）。
- 不動 notify / 金流加解密。
- 上線部署沿用 [[project-inrecord-deploy]]：`vercel --prod` 從本機上傳工作樹（現位 `~/code/inrecord`）。
