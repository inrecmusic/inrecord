# 官網直購改「不自動開通、寄預購信、後台手動開通」實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓官網 PAYUNi 直購付款成功後不自動開通課程、寄「預購成功」信，訂單進後台由賣家用逐筆／勾選／全數三種按鈕手動開通。

**Architecture:** notify 用 fail-safe 開關 `autoGrantEnabled()` gate 掉 `grantAccess`（未設＝關），信件一律預購文案；`/api/admin/orders` 補 `enrolled` 布林（join enrollments）；新增批次開通端點 `/api/admin/grant-orders` 專開官網訂單（現有 grant-access 因硬篩 source 不能用）；付款名單主表格加開通狀態欄與三種開通按鈕，UI 照 `WordpressLeadsPanel.run()` 範本。

**Tech Stack:** Next.js 14 App Router、Supabase（service-role admin client）、vitest 單元測試、既有 `_api()`/`showToast`/`window.confirm` 後台慣例。

## Global Constraints

- **範圍只 `source='payuni'`**：concert（`/api/webhook/concert`）、wordpress、manual 流程完全不動。
- **fail-safe 預設關**：未設 `AUTO_GRANT_ACCESS` ＝不自動開通；`AUTO_GRANT_ACCESS==="on"` 才自動開通。與 `AUTO_INVOICE` 各自獨立。
- **開通核心一律複用** `grantAccess(supabase, order)`（`lib/fulfillment-grant.js`，冪等，upsert enrollments `onConflict:"email,course_id"` + subscriptions 容忍 23505）。
- **開通權威判定**：`enrollments` 表存在 `email=<訂單 email>` 且 `course_id='piano-101'` ＝已開通（官網訂單 `access_granted_at` 不可信）。課程固定 `course_id='piano-101'`。
- **後台慣例**：前端一律用 `_api(path,opts)`（自動帶 `Authorization: Bearer`、401 自動登出）；成功 `showToast("✅ …")`／失敗 `showToast("❌ …："+err)`；破壞性/批次操作前 `window.confirm`；進行中用 busy state 讓按鈕 `disabled` 並改文字。後端一律 `verifyAdminToken(req)`。
- **測試**：純邏輯抽 `lib/*.js` 純函式用 vitest 測；route/UI 靠純函式測試 + build + 手動驗證（沿用專案既有模式，如 `autoInvoiceEnabled`）。

---

### Task 1: `autoGrantEnabled()` 開關（純函式）

**Files:**
- Modify: `lib/order-fulfillment.js`（在 `autoInvoiceEnabled` 後新增）
- Test: `lib/order-fulfillment.test.js`

**Interfaces:**
- Produces: `autoGrantEnabled(env = process.env) => boolean`（`env.AUTO_GRANT_ACCESS === "on"`）

- [ ] **Step 1: 寫失敗測試**

在 `lib/order-fulfillment.test.js` 檔尾（現有 `autoInvoiceEnabled` describe 之後）加：

```js
describe("autoGrantEnabled（自動開通開關，fail-safe 預設關）", () => {
  it("AUTO_GRANT_ACCESS=on → 開啟自動開通", () => {
    expect(autoGrantEnabled({ AUTO_GRANT_ACCESS: "on" })).toBe(true);
  });

  it("未設或其他值 → 關閉（改後台手動開通）", () => {
    expect(autoGrantEnabled({})).toBe(false);
    expect(autoGrantEnabled({ AUTO_GRANT_ACCESS: "off" })).toBe(false);
    expect(autoGrantEnabled({ AUTO_GRANT_ACCESS: "true" })).toBe(false);
    expect(autoGrantEnabled({ AUTO_GRANT_ACCESS: "" })).toBe(false);
    expect(autoGrantEnabled(undefined)).toBe(false);
  });
});
```

同時把第一行 import 改為（加 `autoGrantEnabled`）：

```js
import { needsFulfillment, needsInvoice, autoInvoiceEnabled, autoGrantEnabled } from "./order-fulfillment.js";
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/order-fulfillment.test.js`
Expected: FAIL（`autoGrantEnabled is not a function` / not exported）

- [ ] **Step 3: 實作**

在 `lib/order-fulfillment.js` 的 `autoInvoiceEnabled` 函式之後加：

```js
// 是否自動開通課程（fail-safe 預設關閉）。
// 官網直購改為付款後不自動開通、寄預購信、由後台手動開通（與其他銷售管道一致）。
// 設 AUTO_GRANT_ACCESS=on 才恢復「付款即自動開通」。與 AUTO_INVOICE 各自獨立。
export function autoGrantEnabled(env = process.env) {
  return env?.AUTO_GRANT_ACCESS === "on";
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/order-fulfillment.test.js`
Expected: PASS（全部）

- [ ] **Step 5: Commit**

```bash
git -C ~/code/inrecord add lib/order-fulfillment.js lib/order-fulfillment.test.js
git -C ~/code/inrecord commit -m "feat: 加自動開通 fail-safe 開關 autoGrantEnabled"
```

---

### Task 2: notify 接開關 ＋ 信件一律預購文案

**Files:**
- Modify: `app/api/payuni/notify/route.js`（import L5、grantAccess 段 ~L120-127、寄信 presale ~L176）

**Interfaces:**
- Consumes: `autoGrantEnabled()`（Task 1）
- 行為：開關 off → 不呼叫 `grantAccess`、`sendPurchaseEmail` 傳 `presale:true`；開關 on → 維持原行為

- [ ] **Step 1: 改 import**

`app/api/payuni/notify/route.js` L5，加入 `autoGrantEnabled`：

```js
import { needsFulfillment, needsInvoice, autoInvoiceEnabled, autoGrantEnabled } from "@/lib/order-fulfillment";
```

- [ ] **Step 2: 用開關 gate 掉 grantAccess**

找到 ~L120-127 這段：

```js
        if (order?.email) {
          // 課程／遊戲存取開通（共用 lib/fulfillment-grant，與後台手動開通同一來源）。
          // ⚠️ 冪等：enrollments(onConflict email,course_id) + subscriptions(onConflict payuni_order_id,
          //   ignoreDuplicates) 確保 Payuni 並發／重送 notify 不會重複開通。
          //   subscriptions 需搭配唯一索引 uniq_sub_purchase_order（見 supabase-hardening.sql）。
          const grant = await grantAccess(supabase, order);
          if (!grant.ok) console.error("[payuni notify] grantAccess error", grant.errors.join("; "));
        }
```

把條件 `if (order?.email)` 改成 `if (autoGrantEnabled() && order?.email)`，並在段首加註解：

```js
        // 自動開通（fail-safe 預設關）：官網直購改為付款後不自動開通、由後台手動開通。
        // 設 AUTO_GRANT_ACCESS=on 才恢復付款即開通。開關 off 時本段整段跳過。
        if (autoGrantEnabled() && order?.email) {
          const grant = await grantAccess(supabase, order);
          if (!grant.ok) console.error("[payuni notify] grantAccess error", grant.errors.join("; "));
        }
```

- [ ] **Step 3: 寄信一律預購文案**

找到 ~L171-177 `sendPurchaseEmail({...})`，把 `presale` 那行：

```js
                presale:    isPresale(saleSettings, new Date()),
```

改成（不自動開通時一律「預購成功」文案，因為開通改人工、信不能說「已開通」）：

```js
                // 不自動開通時，信一律「預購成功、開通後 Email 通知」文案（開通改人工）。
                presale:    !autoGrantEnabled() ? true : isPresale(saleSettings, new Date()),
```

- [ ] **Step 4: build 驗證（route 不做單元測試，靠 Task 1 函式測試 + build）**

Run: `cd ~/code/inrecord && npx next build 2>&1 | tail -20`
Expected: build 成功、無型別/語法錯（若 Node 版本讓 build hang，改用 `npx vitest run` 全跑確認無 import 破壞，並在部署時以 Vercel build 為準）

- [ ] **Step 5: Commit**

```bash
git -C ~/code/inrecord add app/api/payuni/notify/route.js
git -C ~/code/inrecord commit -m "feat: notify 接自動開通開關、不開通時寄預購文案"
```

---

### Task 3: `markEnrolled()` 純函式 ＋ orders API 帶 `enrolled`

**Files:**
- Create: `lib/order-enrolled.js`
- Test: `lib/order-enrolled.test.js`
- Modify: `app/api/admin/orders/route.js`

**Interfaces:**
- Produces: `markEnrolled(orders, enrolledEmails) => orders[]`（每筆加 `enrolled:boolean`，email 小寫 trim 比對）
- Produces: `pickUngrantedPayuni(orders, enrolledEmails) => orders[]`（篩 `source==='payuni' && status==='paid' && !enrolled`；Task 4 用）
- `/api/admin/orders` 回傳每筆訂單多一個 `enrolled` 布林

- [ ] **Step 1: 寫失敗測試**

Create `lib/order-enrolled.test.js`：

```js
import { describe, it, expect } from "vitest";
import { markEnrolled, pickUngrantedPayuni } from "./order-enrolled.js";

describe("markEnrolled（用 enrollments email 標記訂單開通狀態）", () => {
  it("email 命中 enrollments → enrolled true（大小寫/空白不敏感）", () => {
    const orders = [{ id: "1", email: "A@x.com" }, { id: "2", email: "b@x.com" }];
    const out = markEnrolled(orders, [" a@x.com "]);
    expect(out[0].enrolled).toBe(true);
    expect(out[1].enrolled).toBe(false);
  });

  it("空輸入安全", () => {
    expect(markEnrolled(null, null)).toEqual([]);
    expect(markEnrolled([{ id: "1", email: "x@x.com" }], null)[0].enrolled).toBe(false);
  });
});

describe("pickUngrantedPayuni（要開通的官網訂單）", () => {
  const orders = [
    { id: "1", email: "a@x.com", source: "payuni", status: "paid" },   // 未開通 → 要
    { id: "2", email: "b@x.com", source: "payuni", status: "paid" },   // 已開通 → 不要
    { id: "3", email: "c@x.com", source: "payuni", status: "pending" },// 未付款 → 不要
    { id: "4", email: "d@x.com", source: "concert", status: "paid" },  // 非官網 → 不要
  ];
  it("只挑 payuni + paid + 未開通", () => {
    const out = pickUngrantedPayuni(orders, ["b@x.com"]);
    expect(out.map(o => o.id)).toEqual(["1"]);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/order-enrolled.test.js`
Expected: FAIL（找不到 `./order-enrolled.js`）

- [ ] **Step 3: 實作純函式**

Create `lib/order-enrolled.js`：

```js
// lib/order-enrolled.js — 用 enrollments 的 email 集合標記/篩選訂單開通狀態（純函式，可測）。
// 官網(payuni)訂單的 access_granted_at 永遠 NULL，開通權威是 enrollments 有無該 email。

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

// 每筆訂單加 enrolled 布林（email 在 enrolledEmails 集合內即已開通）。
export function markEnrolled(orders, enrolledEmails) {
  const set = new Set((enrolledEmails || []).map(norm));
  return (orders || []).map((o) => ({ ...o, enrolled: set.has(norm(o.email)) }));
}

// 篩出「要手動開通」的官網訂單：source=payuni + status=paid + 尚未開通。
export function pickUngrantedPayuni(orders, enrolledEmails) {
  const set = new Set((enrolledEmails || []).map(norm));
  return (orders || []).filter(
    (o) => o.source === "payuni" && o.status === "paid" && !set.has(norm(o.email))
  );
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/order-enrolled.test.js`
Expected: PASS

- [ ] **Step 5: orders API 帶 enrolled**

改 `app/api/admin/orders/route.js`。現況（全 21 行）核心是 `selectAll(supabase,"orders",...)` 後 `return NextResponse.json({ ok:true, data })`。改成撈 enrollments email 後用 `markEnrolled` 包裝：

在檔案 import 區加：

```js
import { markEnrolled } from "@/lib/order-enrolled";
```

把回傳前改為（保留原 `data` 撈法，data 之後插入）：

```js
  // 撈已開通 email（enrollments 是官網訂單開通與否的權威來源）
  const { data: enr } = await supabase
    .from("enrollments")
    .select("email")
    .eq("course_id", "piano-101");
  const withEnrolled = markEnrolled(data, (enr || []).map((e) => e.email));
  return NextResponse.json({ ok: true, data: withEnrolled });
```

（原本 `return NextResponse.json({ ok: true, data });` 這行以上述取代。）

- [ ] **Step 6: build 驗證**

Run: `cd ~/code/inrecord && npx next build 2>&1 | tail -20`
Expected: 成功（如 build 環境問題，至少 `npx vitest run lib/order-enrolled.test.js` PASS）

- [ ] **Step 7: Commit**

```bash
git -C ~/code/inrecord add lib/order-enrolled.js lib/order-enrolled.test.js app/api/admin/orders/route.js
git -C ~/code/inrecord commit -m "feat: orders API 帶 enrolled（join enrollments 判定開通）"
```

---

### Task 4: 批次開通 API `/api/admin/grant-orders`

**Files:**
- Create: `app/api/admin/grant-orders/route.js`
- Test: `lib/order-enrolled.test.js`（`pickUngrantedPayuni` 已於 Task 3 測；本 task 不再加純函式）

**Interfaces:**
- Consumes: `grantAccess`（`lib/fulfillment-grant.js`）、`pickUngrantedPayuni`（Task 3）、`verifyAdminToken`、`getSupabaseAdmin`、`logAudit`
- `POST /api/admin/grant-orders` body `{ ids?: string[] }` → `{ ok, granted, failed, errors[] }`
  - `ids` 給 → 只開通這些 id（仍過濾成 payuni+paid+未開通）；不給 → 全部未開通官網訂單

- [ ] **Step 1: 建 route（比照 grant-access，但改以 order.id 撈、不硬篩 wordpress/concert）**

Create `app/api/admin/grant-orders/route.js`：

```js
import { NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { grantAccess } from "@/lib/fulfillment-grant";
import { pickUngrantedPayuni } from "@/lib/order-enrolled";
import { logAudit } from "@/lib/audit";

// 後台手動開通官網(payuni)已付款訂單。body { ids?: string[] }：
//   給 ids → 只開通這些（仍過濾成 payuni+paid+未開通）；不給 → 全部未開通官網訂單。
// 現有 /api/admin/grant-access 硬篩 source∈{wordpress,concert}，官網單撈不到，故另立此端點。
export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : null;

  const supabase = getSupabaseAdmin();

  // 撈候選官網已付款訂單（給 ids 就限縮）
  let q = supabase.from("orders").select("id, email, plan, plan_label, source, status")
    .eq("source", "payuni").eq("status", "paid");
  if (ids && ids.length) q = q.in("id", ids);
  const { data: orders, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // 撈已開通 email → 篩出真正未開通者
  const { data: enr } = await supabase.from("enrollments").select("email").eq("course_id", "piano-101");
  const pending = pickUngrantedPayuni(orders || [], (enr || []).map((e) => e.email));

  const now = new Date().toISOString();
  let granted = 0, failed = 0;
  const errors = [];
  for (const o of pending) {
    const g = await grantAccess(supabase, o);
    if (g.ok) {
      granted++;
      await supabase.from("orders").update({ access_granted_at: now }).eq("id", o.id);
    } else {
      failed++;
      errors.push(`${o.email}: ${g.errors.join("; ")}`);
    }
  }

  await logAudit(supabase, {
    actor: payload.email, action: "grant_orders",
    targetType: "orders", targetId: ids ? ids.join(",") : "all_pending",
    meta: { granted, failed }, req,
  });

  return NextResponse.json({ ok: true, granted, failed, errors });
}
```

- [ ] **Step 2: 驗證純函式測試仍過（篩選邏輯已在 Task 3 測）**

Run: `npx vitest run lib/order-enrolled.test.js`
Expected: PASS

- [ ] **Step 3: build 驗證**

Run: `cd ~/code/inrecord && npx next build 2>&1 | tail -20`
Expected: 成功

- [ ] **Step 4: 手動驗證閘（部署 preview 後）**

未帶 token POST `/api/admin/grant-orders` 應得 401：
Run: `curl -s -o /dev/null -w "%{http_code}\n" -X POST https://<preview-url>/api/admin/grant-orders`
Expected: `401`

- [ ] **Step 5: Commit**

```bash
git -C ~/code/inrecord add app/api/admin/grant-orders/route.js
git -C ~/code/inrecord commit -m "feat: 新增官網訂單批次開通端點 /api/admin/grant-orders"
```

---

### Task 5: 付款名單 UI — 開通狀態欄 ＋ 逐筆／勾選／全數按鈕 ＋ 待開通提示

**Files:**
- Modify: `app/admin/page.jsx`（`OrdersPage` L1103-1474；`allOrders` map L1182-1199；主表格 L1376-1405）

**Interfaces:**
- Consumes: `/api/admin/orders`（現帶 `enrolled`、`source`）、`/api/admin/grant-orders`（Task 4）
- 依 `WordpressLeadsPanel.run(kind)`(L1046-1065) 範本：勾選送 `{ids}`、全數送 `{}`

- [ ] **Step 1: `allOrders` map 保留 `enrolled`/`source`**

`OrdersPage` 的 `allOrders`（L1182-1199）mapped 物件目前 drop 掉 `source`/`enrolled`。在該物件補兩個欄位（沿用 `realId:o.id` 慣例）：

```js
      // …既有欄位…
      realId: o.id,
      source: o.source,
      enrolled: o.enrolled === true,
      // …其餘既有欄位…
```

- [ ] **Step 2: 加勾選 state 與待開通清單（放在 OrdersPage 內、`allOrders` 定義之後）**

```js
  const [sel, setSel] = useState(() => new Set());
  const [granting, setGranting] = useState(false);
  // 可開通的官網訂單：payuni + 已付款 + 未開通
  const ungranted = allOrders.filter(o => o.source === "payuni" && o.status === "paid" && !o.enrolled);
  const ungrantedIds = ungranted.map(o => o.realId);
  const toggle = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
```

- [ ] **Step 3: 開通函式 `grantIds()`（接受明確 ids，逐筆／勾選／全數共用）**

在 OrdersPage 內加。`ids` 明確傳入、不依賴 `setSel` 時序；`all:true` 送空 body 讓後端開通全部未開通：

```js
  async function grantIds(ids, { all = false } = {}) {
    if (granting || !ids.length) { if (!ids.length) showToast?.("⚠️ 沒有可開通的訂單"); return; }
    if (!window.confirm(`確定開通這 ${ids.length} 筆課程？`)) return;
    setGranting(true);
    try {
      const res = await _api("/api/admin/grant-orders", {
        method: "POST",
        body: JSON.stringify(all ? {} : { ids }),
      });
      const d = await res.json();
      if (!res.ok || d.ok === false) showToast?.("❌ 開通失敗：" + (d.error || "unknown"));
      else {
        showToast?.(`✅ 開通完成：成功 ${d.granted || 0} 筆${d.failed ? `，失敗 ${d.failed} 筆` : ""}`);
        setSel(new Set());
        await loadOrders();
      }
    } finally { setGranting(false); }
  }
  const grantSelected = () => grantIds(Array.from(sel));
  const grantAll = () => grantIds(ungrantedIds, { all: true });
  const grantOne = (realId) => grantIds([realId]);
```

- [ ] **Step 4: 頂部「待開通 N 筆」提示 ＋ 兩顆批次按鈕**

在主表格（L1376 `<table>`）之前插入一段（沿用既有 panel 樣式 class；若無適用 class 用簡單 inline）：

```jsx
        {ungranted.length > 0 && (
          <div className={styles.reconPeriod} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <b>待開通 {ungranted.length} 筆</b>（官網付款、尚未開通課程）
            <button className={styles.btnSmall} disabled={granting || !sel.size} onClick={grantSelected}>
              {granting ? "開通中…" : `開通勾選（${sel.size}）`}
            </button>
            <button className={styles.btnSmall} disabled={granting} onClick={grantAll}>
              {granting ? "開通中…" : `全部開通（${ungranted.length}）`}
            </button>
          </div>
        )}
```

- [ ] **Step 5: 主表格加「開通」欄（表頭）**

主表頭（L1378 `<tr>…訂單編號 | 學員 | … | 操作`）在「狀態」與「發票號碼」之間，或「操作」之前，加一欄 `<th>開通</th>`。建議插在「狀態」欄後：

```jsx
              <th>狀態</th>
              <th>開通</th>
              {/* …發票號碼、建立時間、操作… */}
```

- [ ] **Step 6: 主表格每列加「開通」欄內容（狀態 chip ＋ 逐筆按鈕）**

在每列（L1381-1402 `map` 內）對應位置加一個 `<td>`。只有官網已付款訂單才顯示開通狀態/按鈕，其餘顯示 `—`：

```jsx
              <td>
                {o.source === "payuni" && o.status === "paid" ? (
                  o.enrolled ? (
                    <span style={{ color: "#16a34a", fontWeight: 700 }}>已開通</span>
                  ) : (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <input type="checkbox" checked={sel.has(o.realId)} onChange={() => toggle(o.realId)} />
                      <button className={styles.btnSmall} disabled={granting} onClick={() => grantOne(o.realId)}>
                        {granting ? "…" : "開通"}
                      </button>
                    </span>
                  )
                ) : "—"}
              </td>
```

- [ ] **Step 7: build 驗證**

Run: `cd ~/code/inrecord && npx next build 2>&1 | tail -20`
Expected: 成功、無 JSX/未定義變數錯（`useState` 已在檔案頂部 import；`_api`/`showToast`/`styles`/`loadOrders` 皆 OrdersPage 既有作用域）

- [ ] **Step 8: Commit**

```bash
git -C ~/code/inrecord add app/admin/page.jsx
git -C ~/code/inrecord commit -m "feat: 付款名單開通狀態欄＋逐筆/勾選/全數開通按鈕"
```

---

### Task 6: 部署與端到端驗證

**Files:** 無（部署 + 手動驗證）

- [ ] **Step 1: 全測試綠**

Run: `npx vitest run lib/order-fulfillment.test.js lib/order-enrolled.test.js`
Expected: 全 PASS

- [ ] **Step 2: 推送並部署正式站**

```bash
git -C ~/code/inrecord push
gh auth switch --user inrecmusic && git -C ~/code/inrecord push
npx vercel --prod --yes --cwd ~/code/inrecord
```
（部署見既有慣例；Vercel build 為 build 權威。**不需**設 `AUTO_GRANT_ACCESS`——未設即「不自動開通」。）

- [ ] **Step 3: 驗證 notify 不再自動開通（開關關）**

確認 Vercel **未設** `AUTO_GRANT_ACCESS`（保持關）。官網若有測試真單，付款後：訂單 `status=paid`、`enrollments` **無**該 email、學員收到「預購成功」信。

- [ ] **Step 4: 驗證後台開通**

後台「訂單管理」→ 付款名單：官網已付款訂單顯示「未開通」＋勾選框＋「開通」；頂部「待開通 N 筆」＋兩顆批次鈕。逐筆／勾選／全數各測一次 → 該 email 進 `enrollments`、狀態變「已開通」。

- [ ] **Step 5:（日後）恢復自動開通的方式（記錄，不執行）**

Vercel 設 `AUTO_GRANT_ACCESS=on` → 重新部署 → 官網付款即自動開通、信件恢復依鎖站判斷。

---

## 風險與注意
- **fail-safe 預設關**：部署即生效「不自動開通」。官網近一月零單、無在途單，安全。
- **漏開風險**：靠「待開通 N 筆」提示 + 未開通標示降風險；`grantAccess` 冪等，重複開通安全。
- **既有官網歷史單**（若有 paid 未 enrollment 者）部署後會出現在「待開通」——屬正確行為，賣家批次開通即可。
- 與 `AUTO_INVOICE` 開關獨立；教室鎖站不動（已擋提前上課）。
