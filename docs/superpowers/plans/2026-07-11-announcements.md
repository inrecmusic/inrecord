# 公告 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 後台可發布/置頂公告，已購課學員在教室頂部看到可關閉橫幅與完整公告清單。

**Architecture:** 沿用既有慣例：新表 `announcements`（RLS service_role、`update_updated_at` trigger），後台 CRUD 走 `verifyAdminToken`+`logAudit`，學員讀取走 `getUserClient`+`hasCourseAccess` 只回 published。排序/橫幅挑選邏輯抽成純函式 `lib/announcements-view.js` 做 TDD；教室橫幅關閉狀態以公告 id 存 localStorage（換新公告會重新顯示）。

**Tech Stack:** Next.js 14 App Router（route handlers＋client components）、Supabase（Postgres＋service role）、Vitest（node 純函式測試）。

## Global Constraints

- 學員端 API 驗證：inline `getUserClient(token)`（`createClient` 帶 `Authorization: Bearer <jwt>`）→ `.auth.getUser()`；購課驗證 `hasCourseAccess(getSupabaseAdmin(), user.email)`（`@/lib/course-access`，簽名 `hasCourseAccess(adminSupabase, email)`）。
- 後台 API 驗證：`verifyAdminToken(req)`（`@/lib/adminAuth`，回 payload 或 null → 401）；變更寫 `logAudit(supabase, { actor: payload.email, action, targetType, targetId, meta, req })`（`@/lib/audit`）。
- 特權讀寫用 `getSupabaseAdmin()`（`@/lib/supabase`，可能為 null → 503 `db_not_configured`）。
- 排序規則：**只顯示 published；置頂（pinned）在前；其餘依 created_at 新→舊**。
- 後台前端 token：`sessionStorage.getItem("inrecord_admin_token")`；後台子頁沿用 `admin.module.css`。教室頁為 inline style（無 CSS module），字型常數 `F` 已定義。
- 全部 UI／錯誤文案繁體中文。
- 測試：純函式 `lib/*.test.js`（vitest node，`import { describe, it, expect } from "vitest"`，import 帶 `.js`，繁中敘述）。路由／頁面以 `npm run build` 編譯驗證，功能性留最後 e2e。
- Stage 僅列出的檔案（repo 有無關 untracked docs，**勿** `git add -A`）。commit 訊息結尾：`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。分支 `feat/point2-carousel`。

## File Structure

| 檔案 | 動作 | 職責 |
|---|---|---|
| `lib/announcements-view.js` | 建立 | `sortAnnouncements(list)`＋`pickBanner(sorted, dismissedId)` 純函式 |
| `lib/announcements-view.test.js` | 建立 | 上者單元測試 |
| `supabase-classroom-features.sql` | 修改（append） | `announcements` 表＋RLS＋policy＋`update_updated_at` trigger |
| `app/api/admin/announcements/route.js` | 建立 | 後台 GET(全部)/POST/PATCH/DELETE |
| `app/admin/AnnouncementsPage.jsx` | 建立 | 後台公告管理頁 |
| `app/admin/page.jsx` | 修改 | NAV 加「公告」＋page chain 掛 AnnouncementsPage＋import＋icon |
| `app/api/classroom/announcements/route.js` | 建立 | 學員 GET：驗購課→回 published 已排序清單 |
| `app/classroom/page.jsx` | 修改 | 新增 `AnnouncementsBanner`（頂部橫幅＋全部清單 modal） |

---

### Task 1: 排序/橫幅純函式 `lib/announcements-view.js`

**Files:**
- Create: `lib/announcements-view.js`
- Test: `lib/announcements-view.test.js`

**Interfaces:**
- Produces:
  - `sortAnnouncements(list) => Announcement[]`：濾掉未 published；pinned 在前；同 pinned 依 `created_at` 字串新→舊。
  - `pickBanner(sorted, dismissedId) => Announcement | null`：回排序後第一則；若其 `id === dismissedId` 或無資料回 `null`。

- [ ] **Step 1: 寫失敗測試**

Create `lib/announcements-view.test.js`:

```js
import { describe, it, expect } from "vitest";
import { sortAnnouncements, pickBanner } from "./announcements-view.js";

const A = (id, { pinned = false, published = true, created_at = "2026-01-01T00:00:00Z" } = {}) =>
  ({ id, title: id, body: id, pinned, published, created_at });

describe("sortAnnouncements", () => {
  it("濾掉未發布", () => {
    const out = sortAnnouncements([A("a"), A("b", { published: false })]);
    expect(out.map(x => x.id)).toEqual(["a"]);
  });

  it("置頂在前，其餘依 created_at 新→舊", () => {
    const list = [
      A("old",    { created_at: "2026-01-01T00:00:00Z" }),
      A("new",    { created_at: "2026-03-01T00:00:00Z" }),
      A("pinned", { pinned: true, created_at: "2026-02-01T00:00:00Z" }),
    ];
    expect(sortAnnouncements(list).map(x => x.id)).toEqual(["pinned", "new", "old"]);
  });

  it("多則置頂之間也依時間新→舊", () => {
    const list = [
      A("p_old", { pinned: true, created_at: "2026-01-01T00:00:00Z" }),
      A("p_new", { pinned: true, created_at: "2026-05-01T00:00:00Z" }),
    ];
    expect(sortAnnouncements(list).map(x => x.id)).toEqual(["p_new", "p_old"]);
  });

  it("空或 nullish 輸入回空陣列", () => {
    expect(sortAnnouncements(null)).toEqual([]);
    expect(sortAnnouncements([])).toEqual([]);
  });
});

describe("pickBanner", () => {
  it("回排序後第一則", () => {
    const sorted = [A("top"), A("second")];
    expect(pickBanner(sorted, null)?.id).toBe("top");
  });

  it("第一則已被關閉 → 回 null", () => {
    const sorted = [A("top"), A("second")];
    expect(pickBanner(sorted, "top")).toBe(null);
  });

  it("空清單 → 回 null", () => {
    expect(pickBanner([], null)).toBe(null);
    expect(pickBanner(null, "x")).toBe(null);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run lib/announcements-view.test.js`
Expected: FAIL（找不到 `./announcements-view.js`）

- [ ] **Step 3: 實作**

Create `lib/announcements-view.js`:

```js
// lib/announcements-view.js — 公告排序與橫幅挑選純邏輯。
// 規則：只留 published；pinned 在前；其餘依 created_at 字串新→舊。

export function sortAnnouncements(list) {
  const published = (list || []).filter((a) => a && a.published);
  return published.slice().sort((a, b) => {
    const ap = a.pinned ? 1 : 0;
    const bp = b.pinned ? 1 : 0;
    if (ap !== bp) return bp - ap; // pinned 在前
    return String(b.created_at || "").localeCompare(String(a.created_at || "")); // 新→舊
  });
}

// 取要當橫幅顯示的那一則：排序後第一則；若其 id 已被使用者關閉（dismissedId）或無資料 → null。
export function pickBanner(sorted, dismissedId) {
  const top = (sorted || [])[0];
  if (!top) return null;
  return top.id === dismissedId ? null : top;
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run lib/announcements-view.test.js`
Expected: PASS（7 tests）

- [ ] **Step 5: Commit**

```bash
git add lib/announcements-view.js lib/announcements-view.test.js
git commit -m "feat(announcements): 公告排序/橫幅挑選純函式

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 資料庫 SQL（append 到 `supabase-classroom-features.sql`）

**Files:**
- Modify: `supabase-classroom-features.sql`（在檔尾 append 公告段）

**Interfaces:**
- Produces: `announcements` 表（`id, title, body, pinned, published, created_at, updated_at`）＋`update_updated_at` trigger。

- [ ] **Step 1: 在檔尾 append**

在 `supabase-classroom-features.sql` 現有內容（① 講義段）之後 append：

```sql

-- ───────────────────────────────────────────
-- ⑦ 公告
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS announcements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  pinned     BOOLEAN NOT NULL DEFAULT FALSE,
  published  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS announcements_pub_idx ON announcements (published, pinned, created_at DESC);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_announcements" ON announcements;
CREATE POLICY "service_role_announcements" ON announcements
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 沿用既有 update_updated_at()（supabase-schema.sql 已定義）
DROP TRIGGER IF EXISTS announcements_updated_at ON announcements;
CREATE TRIGGER announcements_updated_at BEFORE UPDATE ON announcements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 2: 靜態檢查**

此檔於 Task 7 由 controller 以 Supabase MCP 套用；本步僅人工讀過確認語法、無 placeholder、append 未破壞既有 ① 段。

- [ ] **Step 3: Commit**

```bash
git add supabase-classroom-features.sql
git commit -m "feat(announcements): announcements 表 + RLS + updated_at trigger SQL

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 後台 API `/api/admin/announcements`

**Files:**
- Create: `app/api/admin/announcements/route.js`

**Interfaces:**
- Consumes: `verifyAdminToken`, `getSupabaseAdmin`, `logAudit`。
- Produces:
  - `GET` → `{ announcements: [...] }`（全部，含未發布；pinned desc, created_at desc）。
  - `POST`（JSON `{ title, body, pinned?, published? }`）→ `{ ok, id }`。
  - `PATCH`（JSON `{ id, title?, body?, pinned?, published? }`）→ `{ ok }`（白名單欄位）。
  - `DELETE`（`?id=`）→ `{ ok }`。

- [ ] **Step 1: 建立路由**

Create `app/api/admin/announcements/route.js`:

```js
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { logAudit } from "@/lib/audit";

export async function GET(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, body, pinned, published, created_at, updated_at")
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ announcements: data || [] });
}

export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const title = (body.title || "").toString().trim();
  const text = (body.body || "").toString().trim();
  if (!title) return NextResponse.json({ error: "no_title" }, { status: 400 });
  if (!text) return NextResponse.json({ error: "no_body" }, { status: 400 });

  const row = {
    title,
    body: text,
    pinned: body.pinned === true,
    published: body.published === true,
  };
  const { data, error } = await supabase.from("announcements").insert(row).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(supabase, {
    actor: payload.email, action: "announcement.create", targetType: "announcement",
    targetId: data?.id, meta: { title, pinned: row.pinned, published: row.published }, req,
  });
  return NextResponse.json({ ok: true, id: data?.id });
}

export async function PATCH(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const id = (body.id || "").toString();
  if (!id) return NextResponse.json({ error: "no_id" }, { status: 400 });

  const allowed = {};
  if (typeof body.title === "string") allowed.title = body.title.trim();
  if (typeof body.body === "string") allowed.body = body.body.trim();
  if (typeof body.pinned === "boolean") allowed.pinned = body.pinned;
  if (typeof body.published === "boolean") allowed.published = body.published;
  if (Object.keys(allowed).length === 0) return NextResponse.json({ error: "no_fields" }, { status: 400 });

  const { error } = await supabase.from("announcements").update(allowed).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(supabase, {
    actor: payload.email, action: "announcement.update", targetType: "announcement", targetId: id, meta: allowed, req,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "no_id" }, { status: 400 });

  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(supabase, {
    actor: payload.email, action: "announcement.delete", targetType: "announcement", targetId: id, meta: {}, req,
  });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: 編譯驗證**

Run: `npm run build`
Expected: 編譯成功，`/api/admin/announcements` 在路由清單，無錯誤指向本檔。

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/announcements/route.js
git commit -m "feat(announcements): 後台公告 API（CRUD + audit）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 後台 UI `AnnouncementsPage` ＋ 掛入 `app/admin/page.jsx`

**Files:**
- Create: `app/admin/AnnouncementsPage.jsx`
- Modify: `app/admin/page.jsx`（import、NAV_GROUPS 加項、page chain 加項、lucide icon）

**Interfaces:**
- Consumes: `GET/POST/PATCH/DELETE /api/admin/announcements`（Task 3）。
- Produces: `<AnnouncementsPage showToast={fn} />`；NAV id `"announcements"`。

- [ ] **Step 1: 建立 AnnouncementsPage**

Create `app/admin/AnnouncementsPage.jsx`:

```jsx
"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2, Pin, Eye, EyeOff } from "lucide-react";
import styles from "./admin.module.css";

const pw = () => (typeof window !== "undefined" ? sessionStorage.getItem("inrecord_admin_token") : "");
function api(path, opts = {}) {
  return fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${pw()}`, ...(opts.headers || {}) } });
}

const EMPTY = { title: "", body: "", pinned: false, published: true };

export default function AnnouncementsPage({ showToast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await api("/api/admin/announcements");
      const d = await r.json();
      setItems(d.announcements || []);
    } catch { setItems([]); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function resetForm() { setForm(EMPTY); setEditingId(null); }

  async function submit(e) {
    e.preventDefault();
    if (!form.title.trim()) { showToast("請輸入標題"); return; }
    if (!form.body.trim()) { showToast("請輸入內容"); return; }
    setBusy(true);
    try {
      let r;
      if (editingId) {
        r = await api("/api/admin/announcements", { method: "PATCH", body: JSON.stringify({ id: editingId, ...form }) });
      } else {
        r = await api("/api/admin/announcements", { method: "POST", body: JSON.stringify(form) });
      }
      if (r.ok) { showToast(editingId ? "✅ 已更新" : "✅ 已發布"); resetForm(); load(); }
      else showToast("❌ 儲存失敗");
    } catch { showToast("❌ 儲存失敗"); }
    setBusy(false);
  }

  function edit(a) {
    setEditingId(a.id);
    setForm({ title: a.title, body: a.body, pinned: !!a.pinned, published: !!a.published });
  }

  async function remove(id) {
    if (!window.confirm("確定要刪除此公告嗎？刪除後無法復原。")) return;
    setBusy(true);
    try {
      const r = await api(`/api/admin/announcements?id=${id}`, { method: "DELETE" });
      if (r.ok) { showToast("✅ 已刪除"); if (editingId === id) resetForm(); load(); }
      else showToast("❌ 刪除失敗");
    } catch { showToast("❌ 刪除失敗"); }
    setBusy(false);
  }

  async function togglePublish(a) {
    setBusy(true);
    try {
      const r = await api("/api/admin/announcements", { method: "PATCH", body: JSON.stringify({ id: a.id, published: !a.published }) });
      if (r.ok) load(); else showToast("❌ 更新失敗");
    } catch { showToast("❌ 更新失敗"); }
    setBusy(false);
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <div><h1>公告</h1><p>發布課程公告，學員在教室頂部可見</p></div>
      </div>

      <form onSubmit={submit} className={styles.card} style={{ display: "grid", gap: 12, marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{editingId ? "編輯公告" : "新增公告"}</h3>
        <input className={styles.input} placeholder="公告標題" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
        <textarea className={styles.input} rows={4} placeholder="公告內容" value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} />
        <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
            <input type="checkbox" checked={form.pinned} onChange={e => setForm(p => ({ ...p, pinned: e.target.checked }))} /> 置頂
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
            <input type="checkbox" checked={form.published} onChange={e => setForm(p => ({ ...p, published: e.target.checked }))} /> 發布（學員可見）
          </label>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {editingId && <button type="button" className={styles.btnSmall} onClick={resetForm}>取消</button>}
            <button type="submit" className={styles.btnPrimary} disabled={busy}><Plus size={14} /> {editingId ? "更新" : "發布"}</button>
          </div>
        </div>
      </form>

      {loading ? <p style={{ color: "#94a3b8" }}>載入中…</p> : items.length === 0 ? (
        <p style={{ color: "#94a3b8" }}>尚無公告</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {items.map(a => (
            <div key={a.id} className={styles.card} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {a.pinned && <Pin size={14} color="#2563eb" />}
                  <strong style={{ fontSize: 15, color: "#0f172a" }}>{a.title}</strong>
                  {!a.published && <span style={{ fontSize: 11, color: "#991b1b", background: "#fee2e2", borderRadius: 6, padding: "2px 8px" }}>未發布</span>}
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748b", whiteSpace: "pre-wrap" }}>{a.body}</p>
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button className={styles.iconBtn} title={a.published ? "設為未發布" : "發布"} onClick={() => togglePublish(a)} disabled={busy} aria-label={a.published ? "設為未發布" : "發布"}>
                  {a.published ? <Eye size={15} /> : <EyeOff size={15} color="#991b1b" />}
                </button>
                <button className={styles.btnSmall} onClick={() => edit(a)}>編輯</button>
                <button className={styles.iconBtn} onClick={() => remove(a.id)} disabled={busy} aria-label="刪除公告"><Trash2 size={15} color="#dc2626" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

> Note: 若 `styles.card` 在 `admin.module.css` 不存在，改用該檔實際的卡片/區塊 class（讀 `app/admin/admin.module.css` 對照，例如既有子頁用的容器 class），並在報告註明替換。`pageHeader`/`input`/`btnPrimary`/`btnSmall`/`iconBtn` 於 materials 任務已確認存在。

- [ ] **Step 2: 掛入 `app/admin/page.jsx` — import ＋ icon**

檔案頂部：在既有 `import ChaptersUnitsPage ...` 等 admin 子頁 import 附近加：
```jsx
import AnnouncementsPage from "./AnnouncementsPage";
```
在既有 `lucide-react` 的 import（含 `LayoutDashboard, BookOpen, ...` 那一大串）中加入 `Megaphone`（若尚未匯入）。

- [ ] **Step 3: 掛入 NAV_GROUPS**

在 `NAV_GROUPS` 的「設定」群組 items 陣列開頭（或適當位置）加：
```jsx
    { id:"announcements", label:"公告", icon:Megaphone },
```

- [ ] **Step 4: 掛入 page chain**

在 `{page==="terms" ...}` 那批 `{page==="x" && <XPage/>}`（約 line 3159–3177）中加一行：
```jsx
          {page==="announcements" &&<AnnouncementsPage showToast={showToast}/>}
```

- [ ] **Step 5: 編譯驗證**

Run: `npm run build`
Expected: 編譯成功，無錯誤指向 `AnnouncementsPage.jsx` / `page.jsx`。

- [ ] **Step 6: Commit**

```bash
git add app/admin/AnnouncementsPage.jsx app/admin/page.jsx
git commit -m "feat(announcements): 後台公告管理 UI + NAV

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 學員 API `/api/classroom/announcements`

**Files:**
- Create: `app/api/classroom/announcements/route.js`

**Interfaces:**
- Consumes: `getSupabaseAdmin`, `hasCourseAccess`, `sortAnnouncements`（Task 1）。
- Produces: `GET /api/classroom/announcements` → `{ announcements: [{ id, title, body, pinned, created_at }] }`（只 published、已排序）。未購課 403。

- [ ] **Step 1: 建立路由**

Create `app/api/classroom/announcements/route.js`:

```js
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { hasCourseAccess } from "@/lib/course-access";
import { sortAnnouncements } from "@/lib/announcements-view";

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
  if (authErr || !user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  if (!(await hasCourseAccess(supabase, user.email))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, body, pinned, published, created_at")
    .eq("published", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sorted = sortAnnouncements(data || []).map(({ id, title, body, pinned, created_at }) => ({ id, title, body, pinned, created_at }));
  return NextResponse.json({ announcements: sorted });
}
```

- [ ] **Step 2: 編譯驗證**

Run: `npm run build`
Expected: 編譯成功，`/api/classroom/announcements` 在路由清單，無錯誤指向本檔。

- [ ] **Step 3: Commit**

```bash
git add app/api/classroom/announcements/route.js
git commit -m "feat(announcements): 學員公告 API（驗購課 + 只回已發布）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 學員 UI — `AnnouncementsBanner`（教室）

**Files:**
- Modify: `app/classroom/page.jsx`

**Interfaces:**
- Consumes: `GET /api/classroom/announcements`（Task 5）；`pickBanner`（Task 1）。
- Produces: 教室頂部可關閉公告橫幅 ＋「全部公告」modal。

- [ ] **Step 1: 匯入 pickBanner**

在 `app/classroom/page.jsx` 既有 import 區加（若該檔已用相對 `@/lib/...` 匯入慣例，沿用）：
```jsx
import { pickBanner } from "@/lib/announcements-view";
```

- [ ] **Step 2: 新增 AnnouncementsBanner 元件**

在其他區塊元件（如 `MaterialsSection`）附近新增（`F` 常數該檔已有）：

```jsx
const DISMISS_KEY = "inrec_dismissed_announcement";

function AnnouncementsBanner({ token }) {
  const [list, setList] = useState([]);
  const [dismissedId, setDismissedId] = useState(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") setDismissedId(localStorage.getItem(DISMISS_KEY));
  }, []);

  useEffect(() => {
    if (!token) { setList([]); return; }
    let cancelled = false;
    fetch("/api/classroom/announcements", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : { announcements: [] }))
      .then(d => { if (!cancelled) setList(d.announcements || []); })
      .catch(() => { if (!cancelled) setList([]); });
    return () => { cancelled = true; };
  }, [token]);

  const banner = pickBanner(list, dismissedId);

  function dismiss() {
    if (banner && typeof window !== "undefined") {
      localStorage.setItem(DISMISS_KEY, banner.id);
      setDismissedId(banner.id);
    }
  }

  if (!list.length) return null;

  return (
    <>
      {banner && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "10px 20px", background: "#eff6ff",
          borderBottom: "1px solid #bfdbfe", fontFamily: F,
        }}>
          <span style={{ fontSize: 16 }}>📢</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#1e3a8a" }}>{banner.title}</span>
            <span style={{ fontSize: 13, color: "#1d4ed8", marginLeft: 8 }}>
              {banner.body.length > 60 ? banner.body.slice(0, 60) + "…" : banner.body}
            </span>
          </div>
          <button onClick={() => setShowAll(true)} style={{ background: "none", border: "none", color: "#1d4ed8", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: F, flexShrink: 0 }}>全部公告</button>
          <button onClick={dismiss} aria-label="關閉公告" style={{ background: "none", border: "none", color: "#64748b", fontSize: 18, lineHeight: 1, cursor: "pointer", flexShrink: 0 }}>×</button>
        </div>
      )}
      {!banner && (
        <div style={{ padding: "6px 20px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontFamily: F }}>
          <button onClick={() => setShowAll(true)} style={{ background: "none", border: "none", color: "#1d4ed8", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: F }}>📢 查看公告（{list.length}）</button>
        </div>
      )}

      {showAll && (
        <div onClick={() => setShowAll(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "grid", placeItems: "center", zIndex: 1000, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, maxWidth: 480, width: "100%", maxHeight: "80vh", overflow: "auto", padding: "22px 24px", fontFamily: F }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 17, color: "#0f172a" }}>📢 課程公告</h3>
              <button onClick={() => setShowAll(false)} aria-label="關閉" style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" }}>×</button>
            </div>
            <div style={{ display: "grid", gap: 14 }}>
              {list.map(a => (
                <div key={a.id} style={{ borderBottom: "1px solid #f1f5f9", paddingBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {a.pinned && <span style={{ fontSize: 11, color: "#2563eb", fontWeight: 700 }}>置頂</span>}
                    <strong style={{ fontSize: 14, color: "#0f172a" }}>{a.title}</strong>
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: "#475569", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{a.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: 掛到教室頂部（topbar 之後、body 之前）**

在教室 return 中，`{/* ── Topbar ── */}` 的 `</header>` 之後、`{/* ── Body ── */}` 之前，插入：
```jsx
      {/* Announcements */}
      <AnnouncementsBanner token={token} />
```

- [ ] **Step 4: 編譯驗證**

Run: `npm run build`
Expected: 編譯成功，無錯誤指向 `app/classroom/page.jsx`。

- [ ] **Step 5: Commit**

```bash
git add app/classroom/page.jsx
git commit -m "feat(announcements): 教室頂部公告橫幅 + 全部公告 modal

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: 部署套用（SQL）＋ 端到端驗證

**Files:** 無（部署與驗證，由 controller 執行）

- [ ] **Step 1: 全套測試 ＋ build**

Run:
```bash
npx vitest run
npm run build
```
Expected: 全綠；build 成功（新增 `/api/admin/announcements`、`/api/classroom/announcements` 兩路由）。

- [ ] **Step 2: 套用 SQL（controller via Supabase MCP）**

- 對正式專案（`vmslzbcegfljlopkewpx`）套用 `supabase-classroom-features.sql` 的 ⑦ 公告段（建表＋index＋RLS＋policy＋trigger）。
- 查詢確認 `announcements` 表已建、RLS 已開、只有 `service_role_announcements` policy（無 `{public}` 讀取 policy 洩漏）。

- [ ] **Step 3: 部署正式站**

```bash
gh auth switch --user inrecmusic
git push origin feat/point2-carousel
npx vercel --prod
```

- [ ] **Step 4: 端到端驗證**

- 未登入 `GET /api/classroom/announcements` → 401；`GET/POST /api/admin/announcements` 未登入 → 401。
- 後台 `/admin` → 公告 → 新增一則（勾發布）→ 列表出現；切換未發布/置頂正常。
- 已購課學員在教室頂部看到橫幅；點「全部公告」開 modal；點「×」關閉後重整不再出現（localStorage 記憶）；發一則新公告後橫幅重新出現。
- 後台刪除測試公告。

---

## Self-Review

**Spec coverage（對照總 spec ⑦ 節）：**
- `announcements` 表（title/body/pinned/published/created_at/updated_at）＋RLS＋trigger → Task 2 ✅
- 後台 NAV「公告管理」＋CRUD＋published/pinned → Task 3/4 ✅
- 學員只回 published、pinned 置頂、created_at desc → Task 1（純函式）＋Task 5 ✅
- 教室頂部可關閉橫幅（localStorage 以 id 記憶）＋完整清單 → Task 6 ✅
- 不做每則已讀 → 未實作已讀（符合 spec 非目標）✅
- 純函式測試 → Task 1；部署/e2e → Task 7 ✅

**Placeholder scan：** 無 TBD/TODO；路由與元件程式碼完整；Task 4 對 `styles.card` 加了「以既有 class 為準」的實作提示（明確對照指示，非 placeholder）。

**Type consistency：** `sortAnnouncements`/`pickBanner`（Task 1）簽名與 Task 5（route 用 sortAnnouncements）、Task 6（用 pickBanner）一致；學員回傳 `{ id, title, body, pinned, created_at }`（Task 5 定義、Task 6 消費一致）；`announcements` 欄位跨 Task 2/3/5 一致；admin id `"announcements"`（NAV／page chain／route 路徑）一致。
