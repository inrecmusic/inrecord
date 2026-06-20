# 指定價通路（Sub-2）實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增「指定價」(type=`price`) 優惠券＋方案鎖定，讓現場序號卡（$2,500）與粉絲序號（$3,499）以固定成交價覆蓋當下波段價，且在公開開賣前（pre_launch）即可兌換。

**Architecture:** 擴充現有 coupons/序號庫系統，不另建。`lib/plans.js` 加 `type='price'`（`applyCoupon` 回 `Math.min(value,base)`）與純函式 `couponPlanError(coupon, plan)`；checkout/validate 加方案鎖，checkout 對有效 price 券繞過 `not_on_sale`；首頁 pre_launch 加「輸入序號」入口、BuyModal 加未開賣模式。

**Tech Stack:** Next.js 14 App Router、Supabase、PAYUNi、vitest。

## Global Constraints

- **建立在 Sub-1 之上**：`currentPrice`/`isOnSale`/`salePhase`/首頁三態已在 master。
- **指定價 clamp**：`applyCoupon` price 型回 `Math.max(0, Math.min(value, 基準價))`——永不比當下價貴。
- **方案鎖**：`coupon.plan && coupon.plan !== 結帳方案` → `coupon_wrong_plan`。`plan=NULL`＝不限（沿用現有 percent/fixed 券）。
- **couponError 不動**（避免破壞既有 9 測試＋2 呼叫）；方案鎖用**獨立純函式 `couponPlanError(coupon, plan)`**（refines 設計 §5）。
- **pre_launch 放行僅限有效 price 券**；percent/fixed 在 pre_launch 仍被 `not_on_sale` 擋。
- **指定價券不疊加**（即最終價）。金額 TWD 整數。
- **測試**：vitest，`lib/*.test.js`，相對 import（`./plans.js`）。
- **不動**：`lib/sale.js`、middleware、開課信/通知、Sub-1 的波段邏輯。
- **新中文 UI 字**套 `word-break:keep-all; line-break:strict`。**Git**：隔離 worktree、explicit paths、commit 結尾 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

---

## File Structure

**修改**
- `supabase-deploy.sql` / `supabase-schema-coupons.sql` — coupons/coupon_batches 加 `plan`；type 註解加 'price'（＋ALTER 遷移）。
- `lib/plans.js` — `applyCoupon` price 型；新增 `couponPlanError`。
- `lib/plans.test.js` — price ＋ couponPlanError 測試。
- `app/api/payuni/checkout/route.js` — 方案鎖＋pre_launch 放行（重構 coupon 取驗順序）。
- `app/api/coupons/validate/route.js` — 方案鎖。
- `app/api/admin/coupons/route.js` — 接受 type='price'＋plan。
- `app/api/admin/coupon-batches/route.js` — 接受 type='price'＋plan（batch＋序號列都寫 plan）。
- `app/admin/page.jsx`（CouponsPage）— 兩表單加「指定價」type＋方案選擇；標籤/徽章支援 price。
- `components/BuyModal.jsx` — `onSale` prop＋未開賣模式＋`coupon_wrong_plan` 文案。
- `app/HomeClient.jsx` — pre_launch「輸入序號/優惠碼」兌換入口＋傳 `onSale` 給 BuyModal。
- `CLAUDE.md` — 指定價通路說明。

---

## Task 1: Schema 遷移（coupons/coupon_batches 加 plan）

**Files:** Modify `supabase-deploy.sql`, `supabase-schema-coupons.sql`

**Interfaces:** Produces `coupons.plan TEXT` / `coupon_batches.plan TEXT`；type 可用值加 'price'。

- [ ] **Step 1: `supabase-deploy.sql` 改 coupons/coupon_batches 區塊**

在 `CREATE TABLE IF NOT EXISTS coupons (...)`：把 `type` 註解改為 `-- 'percent' | 'fixed' | 'price'`；`value` 註解加「price: 指定成交價 NT$」；在 `status` 後加欄：
```sql
  plan        TEXT,                            -- 鎖定方案 'course'|'bundle'；NULL = 不限
```
在 `CREATE TABLE IF NOT EXISTS coupon_batches (...)` 同樣加 `plan TEXT` 並更新 type 註解。

於兩表區塊後追加遷移（idempotent）：
```sql
-- 遷移：指定價通路（Sub-2）
ALTER TABLE coupons        ADD COLUMN IF NOT EXISTS plan TEXT;
ALTER TABLE coupon_batches ADD COLUMN IF NOT EXISTS plan TEXT;
```

- [ ] **Step 2: `supabase-schema-coupons.sql` 同步**

於該檔的 coupons/coupon_batches 定義加 `plan TEXT` 欄與註解（與 deploy 一致；新環境用）。

- [ ] **Step 3: 驗證（部署時人工）**

Supabase 跑上述 ALTER；`SELECT plan FROM coupons LIMIT 1;` 不報錯。（subagent 無 DB 權限 → 記為部署手動步驟；交付＝改好 SQL 檔。）

- [ ] **Step 4: Commit**
```bash
git add supabase-deploy.sql supabase-schema-coupons.sql
git commit -m "feat(coupons): add plan column + price type (Sub-2 schema)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `lib/plans.js` 指定價＋方案鎖（TDD）

**Files:** Modify `lib/plans.js`, `lib/plans.test.js`

**Interfaces:**
- `applyCoupon(price, coupon)` — `coupon.type==='price'` → `Math.max(0, Math.min(coupon.value, price))`；percent/fixed 不變。
- `couponPlanError(coupon, plan) → 'coupon_wrong_plan' | null`（`coupon?.plan && plan && coupon.plan !== plan` → 錯誤碼）。
- `couponError` **不變**。

- [ ] **Step 1: 加測試到 `lib/plans.test.js`**
（import 行加入 `couponPlanError`：`import { PLAN_CATALOG, applyCoupon, couponError, couponPlanError } from "./plans.js";`）
```js
describe("applyCoupon price 型（指定成交價）", () => {
  it("回指定價（低於基準）", () => expect(applyCoupon(5800, { type: "price", value: 2500 })).toBe(2500));
  it("clamp：指定價高於基準 → 取基準", () => expect(applyCoupon(2000, { type: "price", value: 2500 })).toBe(2000));
  it("不低於 0", () => expect(applyCoupon(5800, { type: "price", value: -100 })).toBe(0));
});

describe("couponPlanError 方案鎖", () => {
  it("方案相符 → null", () => expect(couponPlanError({ plan: "bundle" }, "bundle")).toBeNull());
  it("方案不符 → coupon_wrong_plan", () => expect(couponPlanError({ plan: "bundle" }, "course")).toBe("coupon_wrong_plan"));
  it("coupon.plan 為 null（不限）→ null", () => expect(couponPlanError({ plan: null }, "course")).toBeNull());
  it("無 coupon → null（交給 couponError 處理）", () => expect(couponPlanError(null, "bundle")).toBeNull());
});
```

- [ ] **Step 2: 跑測試確認失敗**
Run: `npx vitest run lib/plans.test.js`　Expected: FAIL（`couponPlanError` 未定義、price 分支未處理）。

- [ ] **Step 3: 改 `lib/plans.js`**
`applyCoupon` 改為（加 price 分支於最前）：
```js
export function applyCoupon(price, coupon) {
  if (!coupon) return price;
  if (coupon.type === "price") return Math.max(0, Math.min(coupon.value, price));
  const final = coupon.type === "percent"
    ? Math.round(price * (1 - coupon.value / 100))
    : price - coupon.value;
  return Math.max(0, final);
}
```
於 `couponError` 之後新增：
```js
// 方案鎖：coupon.plan 有值且與結帳方案不符 → 錯誤碼（couponError 保持不變）
export function couponPlanError(coupon, plan) {
  if (coupon && coupon.plan && plan && coupon.plan !== plan) return "coupon_wrong_plan";
  return null;
}
```

- [ ] **Step 4: 跑測試確認通過**
Run: `npx vitest run lib/plans.test.js`　Expected: PASS（含既有 percent/fixed/couponError 測試不回歸）。

- [ ] **Step 5: Commit**
```bash
git add lib/plans.js lib/plans.test.js
git commit -m "feat(coupons): price-type applyCoupon + couponPlanError + tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: checkout 方案鎖＋pre_launch 放行

**Files:** Modify `app/api/payuni/checkout/route.js`

**Interfaces:** Consumes `applyCoupon`/`couponError`/`couponPlanError` (`@/lib/plans`)、`isOnSale`/`currentPrice`/`getSaleSettings` (`@/lib/sale`)。

- [ ] **Step 1: import 加 `couponPlanError`**
`import { PLAN_CATALOG, applyCoupon, couponError } from "@/lib/plans";` → 加 `couponPlanError`：
`import { PLAN_CATALOG, applyCoupon, couponError, couponPlanError } from "@/lib/plans";`

- [ ] **Step 2: 重構 coupon 取驗順序（fetch+validate 先於 isOnSale 閘）**
把現有第 47-88 行（`const saleSettings…` 到 coupon 區塊結束）替換為：
```js
    const saleSettings = await getSaleSettings();
    const label = catalog.label;

    // 先取得並驗證優惠券（讓有效「指定價」券可繞過開賣前封鎖）
    let coupon = null;
    const sb = getSupabaseAdmin();
    if (body.couponCode && sb) {
      const code = String(body.couponCode).trim().toUpperCase();
      const { data } = await sb.from("coupons").select("*").eq("code", code).maybeSingle();
      coupon = data;
      const cErr = couponError(coupon);
      if (cErr) return NextResponse.json({ error: cErr }, { status: 400 });
      const pErr = couponPlanError(coupon, plan);
      if (pErr) return NextResponse.json({ error: pErr }, { status: 400 });
    }

    // pre_launch：僅在有有效「指定價」券時放行（一般購買未開）
    const hasPriceCoupon = !!(coupon && coupon.type === "price");
    if (!isOnSale(saleSettings, new Date()) && !hasPriceCoupon) {
      return NextResponse.json({ error: "not_on_sale" }, { status: 400 });
    }

    let price = currentPrice(plan, saleSettings, new Date());

    // 限量券原子預扣（序號 usage_limit=1）＋套用折扣
    if (coupon) {
      const codeUp = coupon.code;
      if (coupon.usage_limit != null) {
        const prevUsed = coupon.used || 0;
        const { data: claimed } = await sb
          .from("coupons").update({ used: prevUsed + 1 })
          .eq("code", codeUp).eq("used", prevUsed).select("id");
        if (!claimed || claimed.length === 0) {
          return NextResponse.json({ error: "coupon_used_up" }, { status: 400 });
        }
        couponPrevUsed = prevUsed;
        couponClaimed = true;
      }
      price = applyCoupon(price, coupon);
      couponCode = codeUp;
    }
```
（保留其後 `if (price < 1) return amount_too_low;` 與既有發票/PayUni/orders 流程、以及 catch 內 `couponClaimed` 回滾邏輯——皆不變。`couponCode`/`couponPrevUsed`/`couponClaimed` 變數仍在 try 外宣告。）

- [ ] **Step 3: 驗證 build**
Run: `npm run build`　Expected: 成功。
手動（部署後）：pre_launch 用有效 price 序號可結帳；用 percent 券仍 `not_on_sale`；price 券用錯方案 → `coupon_wrong_plan`。

- [ ] **Step 4: Commit**
```bash
git add app/api/payuni/checkout/route.js
git commit -m "feat(coupons): checkout plan-lock + pre-launch bypass for price coupons

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: validate 方案鎖

**Files:** Modify `app/api/coupons/validate/route.js`

**Interfaces:** Consumes `couponPlanError`。

- [ ] **Step 1: import + 方案鎖檢查**
import 加 `couponPlanError`：`import { PLAN_CATALOG, applyCoupon, couponError, couponPlanError } from "@/lib/plans";`
在 `const err = couponError(coupon); if (err) ...` 之後加：
```js
    const pErr = couponPlanError(coupon, plan);
    if (pErr) return NextResponse.json({ valid: false, error: pErr }, { status: 200 });
```
（'price' 折後價已由既有 `applyCoupon(basePrice, coupon)` 處理＝`Math.min(value, basePrice)`；回傳含 `type` 不變。）

- [ ] **Step 2: 驗證 build**
Run: `npm run build`　Expected: 成功。

- [ ] **Step 3: Commit**
```bash
git add app/api/coupons/validate/route.js
git commit -m "feat(coupons): validate enforces coupon plan-lock

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: 後台 API 支援 price＋plan

**Files:** Modify `app/api/admin/coupons/route.js`, `app/api/admin/coupon-batches/route.js`

**Interfaces:** POST 接受 `type='price'`、`plan`（'course'|'bundle'|null）。

- [ ] **Step 1: `coupons` POST（價券）**
第 28 行 `const type = body.type === "fixed" ? "fixed" : "percent";` 改：
```js
  const type  = ["fixed", "price"].includes(body.type) ? body.type : "percent";
  const plan  = ["course", "bundle"].includes(body.plan) ? body.plan : null;
```
insert（第 36-45 行）加 `plan,`。PATCH 白名單（第 64 行）加 `"plan"`。
（`invalid_value`/`percent_over_100` 不變：price 時 value>0 即可，percent_over_100 只擋 percent。）

- [ ] **Step 2: `coupon-batches` POST（序號批次）**
第 35 行 type 改同上、加 plan：
```js
  const type  = ["fixed", "price"].includes(body.type) ? body.type : "percent";
  const plan  = ["course", "bundle"].includes(body.plan) ? body.plan : null;
```
coupon_batches insert（第 73-75 行）加 `plan,`；序號 rows（第 79-82 行）每列加 `plan,`。

- [ ] **Step 3: 驗證 build**
Run: `npm run build`　Expected: 成功。

- [ ] **Step 4: Commit**
```bash
git add app/api/admin/coupons/route.js app/api/admin/coupon-batches/route.js
git commit -m "feat(coupons): admin coupon/batch APIs accept price type + plan lock

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: 後台 UI 支援 price＋plan（CouponsPage）

**Files:** Modify `app/admin/page.jsx`（CouponsPage，約 1050–1340 行）

**Interfaces:** 兩表單（單張優惠券 `form`、序號批次 `batchForm`）可選 type='price'＋方案；送出帶 `type`/`plan`。

- [ ] **Step 1: 表單 state 加 plan**
- 第 1057 行 `form` 初值加 `plan:""`：`useState({name:"",code:"",type:"percent",value:"",plan:"",limit:"",start:"",end:""})`（重設處 1222 同步）。
- 第 1066 行 `batchForm` 初值加 `plan:""`（重設處 1144 同步）。

- [ ] **Step 2: 兩表單加 type 選項與方案選擇**
在兩表單的 type `<select>`（找百分比/折抵的選項）加 `<option value="price">指定價</option>`；其後加方案 `<select>`：
```jsx
<select value={form.plan} onChange={e=>setForm({...form,plan:e.target.value})}>
  <option value="">不限方案</option>
  <option value="course">鋼琴自學全課程</option>
  <option value="bundle">學琴全攻略（課程包）</option>
</select>
```
（batchForm 版用 `batchForm.plan`/`setBatchForm`。type='price' 時 value 標籤顯示「成交價 NT$」。）

- [ ] **Step 3: 送出帶 plan、label/徽章支援 price**
- 兩處 POST body（coupon ~1216、batch 1127）加 `plan: form.plan || null` / `plan: batchForm.plan || null`、`type` 照舊。
- `discountLabel`（1084）加 price：`b.type==="price"?`指定價 NT$${b.value}`:` …
- 徽章（1278-1279、1332-1333）加 price 分支（如綠底「指定價 NT$X」）。
- percent>100 驗證（1121、1212）維持只對 percent。

- [ ] **Step 4: 驗證 build**
Run: `npm run build`　Expected: 成功。手動（部署後）：可建立 type=指定價、plan=bundle 的優惠券與序號批次。

- [ ] **Step 5: Commit**
```bash
git add app/admin/page.jsx
git commit -m "feat(coupons): admin UI for price type + plan lock (coupon & batch forms)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: BuyModal 未開賣模式＋方案鎖文案

**Files:** Modify `components/BuyModal.jsx`

**Interfaces:** Consumes `onSale`（新 prop，來自 `sale.onSale`）。

- [ ] **Step 1: 簽名加 `onSale`**
第 33 行 `export default function BuyModal({ open, onClose, plan, email, pricing }) {` → 加 `onSale = true`：
`export default function BuyModal({ open, onClose, plan, email, pricing, onSale = true }) {`

- [ ] **Step 2: `COUPON_ERRORS` 加方案鎖文案**
第 6-12 行的 `COUPON_ERRORS` 物件加一行：`coupon_wrong_plan: "此優惠碼不適用於此方案",`

- [ ] **Step 3: 未開賣模式——價格顯示與付款鈕**
價格區塊（第 181-187 行）：未開賣且未套碼時改顯示提示。把該 `<div className={styles.price}>…</div>` 內容包一層條件：
```jsx
            <div className={styles.price}>
              {!onSale && !couponApplied
                ? <span style={{ fontSize: 14, color: "#2563eb", fontWeight: 700, wordBreak: "keep-all", lineBreak: "strict" }}>輸入序號查看價格</span>
                : couponApplied
                  ? <><span style={{ textDecoration: "line-through", opacity: .5, fontSize: ".62em", marginRight: 6, fontWeight: 600 }}>NT${Number(basePrice).toLocaleString()}</span>NT${Number(couponApplied.finalPrice).toLocaleString()}</>
                  : earlyBird
                    ? <><span style={{ textDecoration: "line-through", opacity: .5, fontSize: ".62em", marginRight: 6, fontWeight: 600 }}>NT${Number(listPrice).toLocaleString()}</span>NT${Number(basePrice).toLocaleString()}</>
                    : <>NT${Number(basePrice).toLocaleString()}</>}
              {earlyBird && !couponApplied && onSale && <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#D4192C", wordBreak: "keep-all", lineBreak: "strict", marginTop: 2 }}>早鳥優惠</span>}
            </div>
```
付款鈕（第 286-287 行）：未開賣時需已套用「指定價」券才可結帳：
```jsx
          <button className={styles.proceed} onClick={handleCheckout}
            disabled={loading || verifying || (!onSale && couponApplied?.type !== "price")}>
            {loading ? "處理中…" : verifying ? "驗證中…" : (!onSale && couponApplied?.type !== "price") ? "請先輸入有效序號" : "前往付款 →"}
          </button>
```
（一般 wave/list（onSale=true）行為完全不變。）

- [ ] **Step 4: 驗證 build**
Run: `npm run build`　Expected: 成功。

- [ ] **Step 5: Commit**
```bash
git add components/BuyModal.jsx
git commit -m "feat(coupons): BuyModal pre-launch redeem mode (requires price code) + wrong-plan copy

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: 首頁 pre_launch 兌換入口

**Files:** Modify `app/HomeClient.jsx`

**Interfaces:** Consumes `sale.onSale`；用既有 `startBuy(PLANS[1])`（bundle）開 BuyModal。

- [ ] **Step 1: pre_launch 區加「輸入序號」入口**
hero 的 `!sale.onSale` 區塊（第 562-566 行，含 Countdown＋NotifyMeForm）內，於 `<NotifyMeForm />` 後加：
```jsx
                  <p style={{ marginTop: 10, fontSize: 13, wordBreak: "keep-all", lineBreak: "strict" }}>
                    持有序號／優惠碼？
                    <button onClick={() => startBuy(PLANS[1])}
                      style={{ background: "none", border: 0, color: "#2563eb", fontWeight: 800, cursor: "pointer", textDecoration: "underline", padding: 0 }}>
                      點此兌換
                    </button>
                  </p>
```

- [ ] **Step 2: BuyModal 傳 `onSale`**
第 868 行 `<BuyModal ... pricing={selectedPlan ? sale.plans[selectedPlan.plan] : undefined} />` 加 `onSale={sale.onSale}`。

- [ ] **Step 3: 驗證 build**
Run: `npm run build`　Expected: 成功。
手動（部署後）：pre_launch 首頁「點此兌換」開 BuyModal（bundle）；輸入有效 price 序號 → 顯示指定價、可結帳；未輸入則付款鈕停用。

- [ ] **Step 4: Commit**
```bash
git add app/HomeClient.jsx
git commit -m "feat(coupons): homepage pre-launch serial redeem entry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: 文件＋最終 gate

**Files:** Modify `CLAUDE.md`

- [ ] **Step 1: 更新 CLAUDE.md（優惠券段）**
在優惠券/序號庫說明加：「**指定價券（`type='price'`）**＝`value` 為成交價，`applyCoupon` 回 `Math.min(value,基準價)`；可加 `plan` 鎖定方案。用於現場序號卡（$2,500）／粉絲序號（$3,499，皆 bundle）。checkout 對有效指定價券**繞過 `not_on_sale`**（開賣前可兌換）；首頁 pre_launch 有『輸入序號』兌換入口。」surgical 編輯。

- [ ] **Step 2: 全測試＋build**
Run: `npx vitest run && npm run build`　Expected: 全綠、build 成功。

- [ ] **Step 3: Commit**
```bash
git add CLAUDE.md
git commit -m "docs(coupons): document price-type fixed-price channels (Sub-2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 4: 部署檢查（人工，部署後）**
1. Supabase 跑 coupons/coupon_batches `ALTER`（加 plan）。
2. 部署（`npx vercel --prod`）。
3. 後台序號庫建：現場批次（type=指定價、plan=bundle、value=2500、ends_at 活動末）、粉絲批次（value=3499、ends_at=9/3）。
4. 驗證：pre_launch 用序號可結帳、方案鎖、clamp。真機驗。

---

## Self-Review

**1. Spec coverage**：'price' 型＋plan → Task 1/2/5/6 ✓｜applyCoupon clamp → Task 2 ✓｜方案鎖（couponPlanError）→ Task 2/3/4 ✓｜pre_launch 放行 → Task 3 ✓｜validate → Task 4 ✓｜首頁兌換入口＋BuyModal 未開賣模式 → Task 7/8 ✓｜後台 price 序號批次 → Task 5/6 ✓｜兩通路（現場/粉絲）→ 部署設定（Task 9 Step 4）✓｜測試 → Task 2 ✓｜文件 → Task 9 ✓。

**2. Placeholder scan**：每改碼步驟附完整碼或精確 diff＋行號；無 TBD。Admin UI（Task 6）以行號錨點＋確切 state/option/POST 欄位描述（實作前讀 CouponsPage 該段）。

**3. Type consistency**：`couponPlanError(coupon, plan) → 'coupon_wrong_plan'|null` 跨 Task 2/3/4 一致；`applyCoupon` price 型 `Math.min(value,price)` 一致；`coupon.plan`/`coupon.type==='price'` 跨 checkout/validate/admin 一致；BuyModal `onSale` prop 與 HomeClient 傳入一致；`coupon_wrong_plan` 錯誤碼於 lib/checkout/validate/BuyModal COUPON_ERRORS 一致。

> 設計 §5 原寫「改 couponError 簽名」；本計畫**改用獨立 `couponPlanError`**（不破壞既有 couponError 9 測試＋2 呼叫），達成同一方案鎖需求——此為實作精煉，已於 Global Constraints 標註。
