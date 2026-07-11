# 學員自助中心（我的訂單）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 已登入學員可在帳號頁看到自己的訂單（方案、金額、狀態、發票號碼、日期），唯讀。

**Architecture:** 無新表。新增 `/api/classroom/my-orders`（**只驗登入**、不要求購課）以 service role 查 `orders` 中 `email = user.email` 的單，回傳淨化欄位。狀態中文化／發票文案／排序抽成純函式 `lib/my-orders-view.js` 做 TDD。在既有帳號頁 `app/classroom/account/page.jsx`（已於預售 middleware 放行）加「我的訂單」區塊。

**Tech Stack:** Next.js 14 App Router（route handler＋client component）、Supabase（service role）、Vitest（node 純函式測試）。

## Global Constraints

- 學員端 API 驗證：inline `getUserClient(token)`（`createClient` 帶 `Authorization: Bearer <jwt>`）→ `.auth.getUser()`；**本功能只驗登入，不呼叫 `hasCourseAccess`**（未購課者也可看自己的 pending/failed 單）。
- 特權讀取用 `getSupabaseAdmin()`（`@/lib/supabase`，可能為 null → 503 `db_not_configured`）。
- **只回本人訂單**：查詢 `.eq("email", user.email)`；只 `.select` 淨化欄位，**絕不回其他人資料、不回 payuni 內部欄位**。
- 唯讀：不重出發票 PDF、不改單。
- 回傳淨化欄位：`{ mer_trade_no, plan, plan_label, amount, currency, status, invoice_no, source, created_at }`。
- 帳號頁為 inline style（無 CSS module），字型常數 `F` 已定義；`React`/`useState`/`useEffect` 已匯入。
- 全部 UI／錯誤文案繁體中文。
- 測試：純函式 `lib/*.test.js`（vitest node，`import { describe, it, expect } from "vitest"`，import 帶 `.js`，繁中敘述）。路由／頁面以 `npm run build` 編譯驗證，功能性留最後 e2e。
- Stage 僅列出的檔案（repo 有無關 untracked docs，**勿** `git add -A`）。commit 訊息結尾：`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。分支 `feat/point2-carousel`。

## File Structure

| 檔案 | 動作 | 職責 |
|---|---|---|
| `lib/my-orders-view.js` | 建立 | `statusLabel`／`invoiceText`／`sortOrdersDesc` 純函式 |
| `lib/my-orders-view.test.js` | 建立 | 上者單元測試 |
| `app/api/classroom/my-orders/route.js` | 建立 | 學員 GET：驗登入→回本人訂單（淨化） |
| `app/classroom/account/page.jsx` | 修改 | 加「我的訂單」區塊（fetch＋渲染） |

---

### Task 1: 純函式 `lib/my-orders-view.js`

**Files:**
- Create: `lib/my-orders-view.js`
- Test: `lib/my-orders-view.test.js`

**Interfaces:**
- Produces:
  - `statusLabel(status) => string`：`paid→"已付款"`、`pending→"待付款"`、`refunded→"已退款"`、`expired→"已逾期"`、`failed→"付款失敗"`；未知/空 → `"—"`。
  - `invoiceText(invoiceNo) => string`：有值 → `"發票號碼 <no>（已寄至你的信箱）"`；無 → `"發票尚未開立"`。
  - `sortOrdersDesc(list) => Order[]`：依 `created_at` 字串新→舊；不改動輸入；nullish → `[]`。

- [ ] **Step 1: 寫失敗測試**

Create `lib/my-orders-view.test.js`:

```js
import { describe, it, expect } from "vitest";
import { statusLabel, invoiceText, sortOrdersDesc } from "./my-orders-view.js";

describe("statusLabel", () => {
  it("已知狀態中文化", () => {
    expect(statusLabel("paid")).toBe("已付款");
    expect(statusLabel("pending")).toBe("待付款");
    expect(statusLabel("refunded")).toBe("已退款");
    expect(statusLabel("expired")).toBe("已逾期");
    expect(statusLabel("failed")).toBe("付款失敗");
  });
  it("未知/空 → 破折號", () => {
    expect(statusLabel("weird")).toBe("—");
    expect(statusLabel("")).toBe("—");
    expect(statusLabel(undefined)).toBe("—");
  });
});

describe("invoiceText", () => {
  it("有發票號碼", () => {
    expect(invoiceText("AB12345678")).toBe("發票號碼 AB12345678（已寄至你的信箱）");
  });
  it("無發票", () => {
    expect(invoiceText(null)).toBe("發票尚未開立");
    expect(invoiceText("")).toBe("發票尚未開立");
  });
});

describe("sortOrdersDesc", () => {
  it("依 created_at 新→舊", () => {
    const list = [
      { mer_trade_no: "a", created_at: "2026-01-01T00:00:00Z" },
      { mer_trade_no: "b", created_at: "2026-03-01T00:00:00Z" },
    ];
    expect(sortOrdersDesc(list).map(o => o.mer_trade_no)).toEqual(["b", "a"]);
  });
  it("不改動輸入", () => {
    const list = [
      { mer_trade_no: "a", created_at: "2026-01-01T00:00:00Z" },
      { mer_trade_no: "b", created_at: "2026-03-01T00:00:00Z" },
    ];
    sortOrdersDesc(list);
    expect(list.map(o => o.mer_trade_no)).toEqual(["a", "b"]);
  });
  it("nullish → 空陣列", () => {
    expect(sortOrdersDesc(null)).toEqual([]);
    expect(sortOrdersDesc([])).toEqual([]);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run lib/my-orders-view.test.js`
Expected: FAIL（找不到 `./my-orders-view.js`）

- [ ] **Step 3: 實作**

Create `lib/my-orders-view.js`:

```js
// lib/my-orders-view.js — 學員「我的訂單」呈現純邏輯。

const STATUS_MAP = {
  paid: "已付款",
  pending: "待付款",
  refunded: "已退款",
  expired: "已逾期",
  failed: "付款失敗",
};

export function statusLabel(status) {
  return STATUS_MAP[status] || "—";
}

export function invoiceText(invoiceNo) {
  return invoiceNo ? `發票號碼 ${invoiceNo}（已寄至你的信箱）` : "發票尚未開立";
}

export function sortOrdersDesc(list) {
  return (list || []).slice().sort((a, b) =>
    String(b.created_at || "").localeCompare(String(a.created_at || ""))
  );
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run lib/my-orders-view.test.js`
Expected: PASS（7 tests）

- [ ] **Step 5: Commit**

```bash
git add lib/my-orders-view.js lib/my-orders-view.test.js
git commit -m "feat(my-orders): 訂單狀態/發票文案/排序純函式

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 學員 API `/api/classroom/my-orders`

**Files:**
- Create: `app/api/classroom/my-orders/route.js`

**Interfaces:**
- Consumes: `getSupabaseAdmin`。
- Produces: `GET /api/classroom/my-orders` → `{ orders: [{ mer_trade_no, plan, plan_label, amount, currency, status, invoice_no, source, created_at }] }`（只本人、依 created_at desc）。未登入 401。

- [ ] **Step 1: 建立路由**

Create `app/api/classroom/my-orders/route.js`:

```js
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";

function getUserClient(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

export async function GET(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: { user }, error: authErr } = await getUserClient(token).auth.getUser();
  if (authErr || !user || !user.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  // 只回本人（以驗證後的 user.email 為準）的訂單，淨化欄位
  const { data, error } = await supabase
    .from("orders")
    .select("mer_trade_no, plan, plan_label, amount, currency, status, invoice_no, source, created_at")
    .eq("email", user.email)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ orders: data || [] });
}
```

- [ ] **Step 2: 編譯驗證**

Run: `npm run build`
Expected: 編譯成功，`/api/classroom/my-orders` 在路由清單，無錯誤指向本檔。

- [ ] **Step 3: Commit**

```bash
git add app/api/classroom/my-orders/route.js
git commit -m "feat(my-orders): 學員自助訂單 API（驗登入 + 只回本人 + 淨化）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 帳號頁「我的訂單」區塊

**Files:**
- Modify: `app/classroom/account/page.jsx`

**Interfaces:**
- Consumes: `GET /api/classroom/my-orders`（Task 2）；`statusLabel`／`invoiceText`／`sortOrdersDesc`（Task 1）。
- Produces: 帳號頁卡片內「我的訂單」區塊。

- [ ] **Step 1: 匯入純函式 ＋ 加 state**

在 `app/classroom/account/page.jsx` 既有 import（`import { validateDisplayName } from "@/lib/account";` 附近）加：
```jsx
import { statusLabel, invoiceText, sortOrdersDesc } from "@/lib/my-orders-view";
```
在既有 state（`const [saving, setSaving] = useState(false);` 之後）加：
```jsx
  const [orders, setOrders] = useState(null); // null=載入中, []=空
```

- [ ] **Step 2: 加訂單 fetch effect**

在既有顯示名稱 init `useEffect(...)` **之後**，新增一個 effect：
```jsx
  useEffect(() => {
    if (!supabase) { setOrders([]); return; }
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { if (!cancelled) setOrders([]); return; }
      try {
        const r = await fetch("/api/classroom/my-orders", { headers: { Authorization: `Bearer ${token}` } });
        const d = r.ok ? await r.json() : { orders: [] };
        if (!cancelled) setOrders(d.orders || []);
      } catch { if (!cancelled) setOrders([]); }
    })();
    return () => { cancelled = true; };
  }, []);
```

- [ ] **Step 3: 加「我的訂單」區塊**

在 return 的卡片內，「修改密碼 →」那個 `<div style={{ borderTop... }}>` **之前**，插入：
```jsx
        <div style={{ borderTop: "1px solid #eef2f7", marginTop: 22, paddingTop: 18 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15, color: "#0f172a" }}>我的訂單</h3>
          {orders === null ? (
            <p style={{ color: "#94a3b8", fontSize: 13 }}>載入中…</p>
          ) : orders.length === 0 ? (
            <p style={{ color: "#94a3b8", fontSize: 13 }}>目前沒有訂單</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {sortOrdersDesc(orders).map(o => {
                const st = o.status;
                const stColor = st === "paid" ? "#16a34a" : st === "refunded" ? "#dc2626" : st === "pending" ? "#b45309" : "#64748b";
                return (
                  <div key={o.mer_trade_no} style={{ border: "1px solid #eef2f7", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{o.plan_label || o.plan || "課程"}</span>
                      <span style={{ fontSize: 14, color: "#0f172a", flexShrink: 0 }}>NT${(o.amount || 0).toLocaleString()}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: stColor }}>{statusLabel(o.status)}</span>
                      <span style={{ fontSize: 12, color: "#94a3b8" }}>{o.created_at ? new Date(o.created_at).toLocaleDateString("zh-TW") : ""}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{invoiceText(o.invoice_no)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
```

- [ ] **Step 4: 編譯驗證**

Run: `npm run build`
Expected: 編譯成功，無錯誤指向 `app/classroom/account/page.jsx`。

- [ ] **Step 5: Commit**

```bash
git add app/classroom/account/page.jsx
git commit -m "feat(my-orders): 帳號頁我的訂單區塊

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 部署 ＋ 端到端驗證

**Files:** 無（部署與驗證，由 controller 執行）。**本功能無新資料表，無 SQL 步驟。**

- [ ] **Step 1: 全套測試 ＋ build**

Run:
```bash
npx vitest run
npm run build
```
Expected: 全綠；build 成功（新增 `/api/classroom/my-orders` 路由）。

- [ ] **Step 2: 部署正式站**

```bash
gh auth switch --user inrecmusic
git push origin feat/point2-carousel
npx vercel --prod
```

- [ ] **Step 3: 端到端驗證**

- 未登入 `GET /api/classroom/my-orders` → 401。
- 已登入（有訂單的帳號）進 `/classroom/account` → 「我的訂單」列出本人訂單，方案／金額／狀態（中文）／發票文案／日期正確。
- 驗隱私：以 controller 用 Supabase 查兩個不同 email 的訂單數，確認 API 回傳只含登入者 email 的單（route 已 `.eq("email", user.email)`）。
- 沒有訂單的帳號 → 顯示「目前沒有訂單」。

---

## Self-Review

**Spec coverage（對照總 spec ⑤ 節）：**
- 無新表、`/api/classroom/my-orders` 讀本人 orders、淨化欄位 → Task 2 ✅
- 只驗登入（非購課）、放在既有帳號頁 → Task 2（gate）＋ Task 3（UI）✅
- 狀態中文化、發票「已開立/寄至信箱」文案、只顯示不重出 PDF → Task 1＋Task 3 ✅
- 純函式測試 → Task 1；部署/e2e → Task 4 ✅

**Placeholder scan：** 無 TBD/TODO；路由與 UI 程式碼完整；插入點以「在 X 之前/之後」明確標示。

**Type consistency：** `statusLabel`/`invoiceText`/`sortOrdersDesc`（Task 1）簽名與 Task 3 使用一致；API 回傳 `{ orders:[{mer_trade_no,plan,plan_label,amount,currency,status,invoice_no,source,created_at}] }`（Task 2 定義、Task 3 消費一致）；路徑 `/api/classroom/my-orders` 一致。
