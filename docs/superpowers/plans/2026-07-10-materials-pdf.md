# 講義／樂譜 PDF 下載 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓後台可對「課程單元」或「全課程」上傳 PDF 講義，已購課學員在教室看到並下載（走簽名 URL）。

**Architecture:** 沿用既有 `proof-uploads` 模式：新私有 bucket `course-materials`，伺服器端上傳（service role），下載一律經後端簽發 5 分鐘簽名 URL。新表 `materials`（`video_id` 為 NULL＝全課程通用）。後台 API 用 `verifyAdminToken`；學員 API 用 `getUserClient`＋`hasCourseAccess` 把關。PDF 驗證（magic bytes＋大小）抽成純函式 `lib/material-file.js` 做 TDD。

**Tech Stack:** Next.js 14 App Router（route handlers＋client components）、Supabase（Storage＋Postgres＋service role）、Vitest（node 純函式測試）。

## Global Constraints

- 學員端 API 驗證：inline `getUserClient(token)`（`createClient` 帶 `Authorization: Bearer <jwt>`）→ `.auth.getUser()`；購課驗證 `hasCourseAccess(getSupabaseAdmin(), user.email)`（`@/lib/course-access`，已存在，簽名 `hasCourseAccess(adminSupabase, email)`）。
- 後台 API 驗證：`verifyAdminToken(req)`（`@/lib/adminAuth`，回 payload 或 null）；變更寫 `logAudit(supabase, { actor: payload.email, action, targetType, targetId, meta, req })`（`@/lib/audit`）。
- 特權讀寫用 `getSupabaseAdmin()`（`@/lib/supabase`，可能為 null → 回 503 `db_not_configured`）。
- Storage：bucket `course-materials`（私有）；上傳路徑 `materials/{randomUUID()}.pdf`（`crypto.randomUUID`）；下載用 `createSignedUrl(path, 300)`。
- 只收 PDF；單檔上限 20MB。
- 後台前端 token：`sessionStorage.getItem("inrecord_admin_token")`；後台子頁沿用 `admin.module.css`。教室頁為 inline style（無 CSS module）。
- 全部 UI／錯誤文案繁體中文。
- 測試：純函式 `lib/*.test.js`（vitest node，`import { describe, it, expect } from "vitest"`，import 帶 `.js`，繁中敘述）。路由／頁面以 `npm run build` 編譯驗證，功能性留最後 e2e。
- Stage 僅列出的檔案（repo 有無關 untracked docs，**勿** `git add -A`）。commit 訊息結尾：`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。分支 `feat/point2-carousel`。

## File Structure

| 檔案 | 動作 | 職責 |
|---|---|---|
| `lib/material-file.js` | 建立 | `validateMaterialFile(bytes, mime)` PDF 驗證純函式 |
| `lib/material-file.test.js` | 建立 | 上者單元測試 |
| `supabase-classroom-features.sql` | 建立 | `materials` 表＋RLS＋policy＋`course-materials` bucket（本檔亦供後續 P1-P3 其他功能續加） |
| `app/api/admin/materials/route.js` | 建立 | 後台 GET 列表／POST 上傳／DELETE |
| `app/admin/MaterialsManager.jsx` | 建立 | 後台講義管理元件（某單元或全課程） |
| `app/admin/ChaptersUnitsPage.jsx` | 修改 | 掛入「講義」按鈕（每單元＋全課程）＋ MaterialsManager modal |
| `app/api/classroom/materials/route.js` | 建立 | 學員 GET：驗購課→回該單元＋通用講義＋簽名 URL |
| `app/classroom/page.jsx` | 修改 | 新增 `MaterialsSection`，資訊列下方顯示講義下載 |

---

### Task 1: PDF 驗證純函式 `lib/material-file.js`

**Files:**
- Create: `lib/material-file.js`
- Test: `lib/material-file.test.js`

**Interfaces:**
- Produces: `validateMaterialFile(bytes: Uint8Array, declaredMime: string) => { ok: true, ext: "pdf" } | { ok: false, error: "bad_type" | "too_large" | "bad_magic" }`。

- [ ] **Step 1: 寫失敗測試**

Create `lib/material-file.test.js`:

```js
import { describe, it, expect } from "vitest";
import { validateMaterialFile, MATERIAL_MAX_BYTES } from "./material-file.js";

// %PDF = 0x25 0x50 0x44 0x46
const pdfHead = () => Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

describe("validateMaterialFile", () => {
  it("合法 PDF（magic + mime + 大小）→ ok, ext=pdf", () => {
    expect(validateMaterialFile(pdfHead(), "application/pdf")).toEqual({ ok: true, ext: "pdf" });
  });

  it("mime 非 application/pdf → bad_type", () => {
    expect(validateMaterialFile(pdfHead(), "image/png")).toEqual({ ok: false, error: "bad_type" });
  });

  it("mime 對但內容非 %PDF magic → bad_magic", () => {
    const notPdf = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
    expect(validateMaterialFile(notPdf, "application/pdf")).toEqual({ ok: false, error: "bad_magic" });
  });

  it("超過 20MB → too_large", () => {
    const big = new Uint8Array(MATERIAL_MAX_BYTES + 1);
    big.set(pdfHead(), 0);
    expect(validateMaterialFile(big, "application/pdf")).toEqual({ ok: false, error: "too_large" });
  });

  it("缺 bytes → bad_type", () => {
    expect(validateMaterialFile(null, "application/pdf")).toEqual({ ok: false, error: "bad_type" });
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run lib/material-file.test.js`
Expected: FAIL（找不到 `./material-file.js` / 非函式）

- [ ] **Step 3: 實作**

Create `lib/material-file.js`:

```js
// lib/material-file.js — 講義檔驗證純邏輯（僅 PDF，magic byte + 20MB）。
export const MATERIAL_MAX_BYTES = 20 * 1024 * 1024;

export function validateMaterialFile(bytes, declaredMime) {
  if (!bytes || bytes.length === 0) return { ok: false, error: "bad_type" };
  if (bytes.length > MATERIAL_MAX_BYTES) return { ok: false, error: "too_large" };
  if (declaredMime !== "application/pdf") return { ok: false, error: "bad_type" };
  // %PDF
  const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  if (!isPdf) return { ok: false, error: "bad_magic" };
  return { ok: true, ext: "pdf" };
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run lib/material-file.test.js`
Expected: PASS（5 tests）

- [ ] **Step 5: Commit**

```bash
git add lib/material-file.js lib/material-file.test.js
git commit -m "feat(materials): PDF 講義檔驗證純函式 validateMaterialFile

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 資料庫 SQL `supabase-classroom-features.sql`

**Files:**
- Create: `supabase-classroom-features.sql`

**Interfaces:**
- Produces: `materials` 表（`id, video_id, title, storage_path, file_size, sort_order, created_at`）＋私有 bucket `course-materials`。此檔為教室七大功能共用的新 SQL，之後其他功能於本檔續加分段。

- [ ] **Step 1: 建立 SQL 檔**

Create `supabase-classroom-features.sql`:

```sql
-- 教室七大功能：資料表與 Storage（idempotent，可分段執行）
-- 依 CLAUDE.md 部署慣例，屬 supabase-deploy 之後的新增；沿用 service_role RLS 模式。

-- ───────────────────────────────────────────
-- ① 講義／樂譜 PDF 下載
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS materials (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id     UUID REFERENCES videos(id) ON DELETE CASCADE,  -- NULL = 全課程通用講義
  title        TEXT NOT NULL,
  storage_path TEXT NOT NULL,                                  -- course-materials bucket 內路徑
  file_size    INTEGER,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS materials_video_id_idx ON materials (video_id);

ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_materials" ON materials;
CREATE POLICY "service_role_materials" ON materials
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 私有 bucket：講義 PDF。下載一律經後端簽名 URL（service role 繞過 RLS，故不需額外 storage policy）。
INSERT INTO storage.buckets (id, name, public)
  VALUES ('course-materials', 'course-materials', false)
  ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: 靜態檢查（不連線 DB）**

此檔於部署階段（Task 7）由 controller 以 Supabase MCP 套用；本步僅確認檔案語法合理、無 placeholder。人工讀過即可。

- [ ] **Step 3: Commit**

```bash
git add supabase-classroom-features.sql
git commit -m "feat(materials): materials 表 + course-materials 私有 bucket SQL

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 後台 API `/api/admin/materials`

**Files:**
- Create: `app/api/admin/materials/route.js`

**Interfaces:**
- Consumes: `verifyAdminToken`, `getSupabaseAdmin`, `validateMaterialFile`（Task 1）, `logAudit`。
- Produces: `GET /api/admin/materials?video_id=<uuid|省略>`（省略＝通用講義）→ `{ materials: [{id,video_id,title,storage_path,file_size,sort_order,created_at}] }`；`POST`（multipart `file`,`title`,`video_id?`）→ `{ ok, id }`；`DELETE /api/admin/materials?id=<uuid>` → `{ ok }`。

- [ ] **Step 1: 建立路由**

Create `app/api/admin/materials/route.js`:

```js
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { validateMaterialFile } from "@/lib/material-file";
import { logAudit } from "@/lib/audit";

const BUCKET = "course-materials";

export async function GET(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const videoId = new URL(req.url).searchParams.get("video_id");
  let q = supabase
    .from("materials")
    .select("id, video_id, title, storage_path, file_size, sort_order, created_at")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  q = videoId ? q.eq("video_id", videoId) : q.is("video_id", null);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ materials: data || [] });
}

export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const formData = await req.formData();
  const file = formData.get("file");
  const title = (formData.get("title") || "").toString().trim();
  const videoId = (formData.get("video_id") || "").toString().trim() || null;

  if (!file || typeof file === "string") return NextResponse.json({ error: "no_file" }, { status: 400 });
  if (!title) return NextResponse.json({ error: "no_title" }, { status: 400 });

  const buf = new Uint8Array(await file.arrayBuffer());
  const v = validateMaterialFile(buf, file.type);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const path = `materials/${randomUUID()}.${v.ext}`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, buf, { contentType: "application/pdf", upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data, error } = await supabase
    .from("materials")
    .insert({ video_id: videoId, title, storage_path: path, file_size: buf.length })
    .select("id")
    .single();
  if (error) {
    // 入庫失敗 → 清掉剛上傳的孤兒檔
    await supabase.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit(supabase, {
    actor: payload.email, action: "material.create", targetType: "material",
    targetId: data?.id, meta: { title, video_id: videoId }, req,
  });
  return NextResponse.json({ ok: true, id: data?.id });
}

export async function DELETE(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "no_id" }, { status: 400 });

  const { data: row } = await supabase.from("materials").select("storage_path").eq("id", id).maybeSingle();
  if (row?.storage_path) await supabase.storage.from(BUCKET).remove([row.storage_path]);
  const { error } = await supabase.from("materials").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(supabase, {
    actor: payload.email, action: "material.delete", targetType: "material", targetId: id, meta: {}, req,
  });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: 編譯驗證**

Run: `npm run build`
Expected: 編譯成功，`/api/admin/materials` 出現在路由清單，無錯誤指向本檔。

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/materials/route.js
git commit -m "feat(materials): 後台講義 API（上傳/列表/刪除）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 後台 UI — `MaterialsManager` 元件 ＋ 掛入 `ChaptersUnitsPage`

**Files:**
- Create: `app/admin/MaterialsManager.jsx`
- Modify: `app/admin/ChaptersUnitsPage.jsx`

**Interfaces:**
- Consumes: `GET/POST/DELETE /api/admin/materials`（Task 3）。
- Produces: `<MaterialsManager videoId={string|null} title={string} onClose={fn} showToast={fn} />` modal。

- [ ] **Step 1: 建立 MaterialsManager 元件**

Create `app/admin/MaterialsManager.jsx`:

```jsx
"use client";
import { useEffect, useState } from "react";
import { X, Upload, Trash2, FileText } from "lucide-react";
import styles from "./admin.module.css";

const pw = () => (typeof window !== "undefined" ? sessionStorage.getItem("inrecord_admin_token") : "");

export default function MaterialsManager({ videoId, title, onClose, showToast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const qs = videoId ? `?video_id=${videoId}` : "";

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/materials${qs}`, { headers: { Authorization: `Bearer ${pw()}` } });
      const d = await r.json();
      setItems(d.materials || []);
    } catch { setItems([]); }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [videoId]);

  async function upload(e) {
    e.preventDefault();
    if (!file) { showToast("請選擇 PDF 檔"); return; }
    if (!name.trim()) { showToast("請輸入講義名稱"); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", name.trim());
      if (videoId) fd.append("video_id", videoId);
      const r = await fetch("/api/admin/materials", { method: "POST", headers: { Authorization: `Bearer ${pw()}` }, body: fd });
      const d = await r.json();
      if (!r.ok) {
        const msg = { too_large: "檔案超過 20MB", bad_type: "僅接受 PDF", bad_magic: "檔案不是有效的 PDF" }[d.error] || d.error || "上傳失敗";
        showToast("❌ " + msg);
      } else {
        showToast("✅ 講義已上傳");
        setFile(null); setName("");
        load();
      }
    } catch { showToast("❌ 上傳失敗"); }
    setBusy(false);
  }

  async function remove(id) {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/materials?id=${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${pw()}` } });
      if (r.ok) { showToast("✅ 已刪除"); load(); } else showToast("❌ 刪除失敗");
    } catch { showToast("❌ 刪除失敗"); }
    setBusy(false);
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalCard} onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>講義管理 — {title}</h3>
          <button className={styles.iconBtn} onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={upload} style={{ display: "grid", gap: 10, marginBottom: 18 }}>
          <input className={styles.input} placeholder="講義名稱（例：第 1 課 和弦表）" value={name} onChange={e => setName(e.target.value)} />
          <input type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} />
          <button type="submit" className={styles.btn} disabled={busy}><Upload size={14} /> {busy ? "上傳中…" : "上傳 PDF"}</button>
        </form>

        {loading ? <p style={{ color: "#94a3b8", fontSize: 14 }}>載入中…</p> : items.length === 0 ? (
          <p style={{ color: "#94a3b8", fontSize: 14 }}>尚無講義</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {items.map(m => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 8 }}>
                <FileText size={16} color="#dc2626" />
                <span style={{ flex: 1, fontSize: 14, color: "#0f172a" }}>{m.title}</span>
                <button className={styles.iconBtn} onClick={() => remove(m.id)} disabled={busy}><Trash2 size={15} color="#dc2626" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

> Note: `admin.module.css` 已有 `modalOverlay`/`modalCard`/`iconBtn`/`input`/`btn` class（其他子頁與 ChaptersUnitsPage 的 modal 皆用）。若某個 class 名稱在該檔不存在，實作時以該檔實際既有 modal 用到的 class 名為準（讀 `app/admin/ChaptersUnitsPage.jsx` 既有 modal 區塊對照），並在報告中註明替換。

- [ ] **Step 2: 掛入 ChaptersUnitsPage — import ＋ state**

Modify `app/admin/ChaptersUnitsPage.jsx`：

檔案頂部 import 區加：
```jsx
import MaterialsManager from "./MaterialsManager";
```
在元件 state 區（例如 `videoModal` 那批 useState 附近）加：
```jsx
  const [matModal, setMatModal] = useState(null); // null | { videoId: string|null, title: string }
```

- [ ] **Step 3: 掛入入口按鈕 ＋ modal**

在頁首標題區（`<div><h1>章節與單元管理</h1>...` 那塊，約 line 167）旁加一顆「全課程通用講義」按鈕：
```jsx
        <button className={styles.btnSmall} onClick={() => setMatModal({ videoId: null, title: "全課程通用" })}>
          📎 通用講義
        </button>
```
在每個單元列的操作按鈕群（既有「編輯」「刪除」那排，約 line 250 附近 `{v.bunny_video_id && (` 同一列的按鈕區）加一顆該單元的講義按鈕：
```jsx
                        <button className={styles.btnSmall} onClick={() => setMatModal({ videoId: v.id, title: v.title })}>📎 講義</button>
```
在 return 的最後（既有 `{videoModal && (...)}` modal 之後）掛上：
```jsx
      {matModal && (
        <MaterialsManager
          videoId={matModal.videoId}
          title={matModal.title}
          showToast={showToast}
          onClose={() => setMatModal(null)}
        />
      )}
```

> `showToast` 已是本元件 props（既有子頁簽名 `{ showToast }`）。`styles.btnSmall` 為既有 class。實作時對照既有單元列與按鈕區的實際 JSX 決定確切插入點，保持其餘不動。

- [ ] **Step 4: 編譯驗證**

Run: `npm run build`
Expected: 編譯成功，無錯誤指向 `MaterialsManager.jsx` 或 `ChaptersUnitsPage.jsx`。

- [ ] **Step 5: Commit**

```bash
git add app/admin/MaterialsManager.jsx app/admin/ChaptersUnitsPage.jsx
git commit -m "feat(materials): 後台講義管理 UI（單元＋全課程）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 學員 API `/api/classroom/materials`

**Files:**
- Create: `app/api/classroom/materials/route.js`

**Interfaces:**
- Consumes: `getSupabaseAdmin`, `hasCourseAccess`。
- Produces: `GET /api/classroom/materials?video_id=<uuid|省略>` → `{ materials: [{ id, title, file_size, video_id, url }] }`（`url`＝5 分鐘簽名下載連結）。未購課 403。

- [ ] **Step 1: 建立路由**

Create `app/api/classroom/materials/route.js`:

```js
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { hasCourseAccess } from "@/lib/course-access";

const BUCKET = "course-materials";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  // video_id 需為合法 UUID 才採用（避免注入 PostgREST or() 過濾）
  const raw = new URL(req.url).searchParams.get("video_id");
  const videoId = raw && UUID_RE.test(raw) ? raw : null;

  // 該單元講義（若有 videoId）＋ 全課程通用講義（video_id IS NULL）
  let q = supabase
    .from("materials")
    .select("id, video_id, title, file_size, storage_path, sort_order")
    .order("sort_order", { ascending: true });
  q = videoId ? q.or(`video_id.eq.${videoId},video_id.is.null`) : q.is("video_id", null);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const materials = [];
  for (const m of data || []) {
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(m.storage_path, 300);
    materials.push({ id: m.id, title: m.title, file_size: m.file_size, video_id: m.video_id, url: signed?.signedUrl || null });
  }
  return NextResponse.json({ materials });
}
```

- [ ] **Step 2: 編譯驗證**

Run: `npm run build`
Expected: 編譯成功，`/api/classroom/materials` 在路由清單，無錯誤指向本檔。

- [ ] **Step 3: Commit**

```bash
git add app/api/classroom/materials/route.js
git commit -m "feat(materials): 學員講義 API（驗購課 + 簽名下載）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 學員 UI — `MaterialsSection`（教室）

**Files:**
- Modify: `app/classroom/page.jsx`

**Interfaces:**
- Consumes: `GET /api/classroom/materials?video_id=`（Task 5）。
- Produces: 教室資訊列下方的「講義下載」區塊。

- [ ] **Step 1: 新增 MaterialsSection 元件**

在 `app/classroom/page.jsx` 中，其他區塊元件（如 `CommentsSection`）定義處附近，新增（`F` 字型常數該檔已有）：

```jsx
function MaterialsSection({ token, video }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!token) return;
    const qs = video?.id ? `?video_id=${video.id}` : "";
    fetch(`/api/classroom/materials${qs}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : { materials: [] }))
      .then(d => setItems(d.materials || []))
      .catch(() => setItems([]));
  }, [token, video?.id]);

  if (!items.length) return null;

  return (
    <div style={{ padding: "12px 20px", background: "#fff", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", marginBottom: 8 }}>📎 講義下載</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {items.map(m => (
          <a
            key={m.id}
            href={m.url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              fontSize: 13, color: "#1d4ed8", textDecoration: "none",
              background: "#eff6ff", border: "1px solid #bfdbfe",
              borderRadius: 8, padding: "7px 12px", fontFamily: F,
            }}
          >
            <span style={{ color: "#dc2626", fontWeight: 700 }}>PDF</span>
            {m.title}{m.video_id ? "" : "（通用）"}
          </a>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 掛到資訊列下方**

在教室 return 中，`{/* Info bar */}` 那個 div 結束之後、`{/* Comments Section */}` 之前，插入：
```jsx
          {/* Materials */}
          <MaterialsSection token={token} video={currentVideo} />
```

- [ ] **Step 3: 編譯驗證**

Run: `npm run build`
Expected: 編譯成功，無錯誤指向 `app/classroom/page.jsx`。

- [ ] **Step 4: Commit**

```bash
git add app/classroom/page.jsx
git commit -m "feat(materials): 教室講義下載區塊

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: 部署套用（SQL＋bucket）＋ 端到端驗證

**Files:** 無（部署與驗證，由 controller 執行）

- [ ] **Step 1: 全套測試 ＋ build**

Run:
```bash
npx vitest run
npm run build
```
Expected: 全綠；build 成功（新增 `/api/admin/materials`、`/api/classroom/materials` 兩路由）。

- [ ] **Step 2: 套用 SQL ＋ 建 bucket（controller via Supabase MCP）**

- 對正式專案（`vmslzbcegfljlopkewpx`）執行 `supabase-classroom-features.sql` 的 materials 段（建表＋RLS＋policy）。
- 確認 `course-materials` bucket 存在且**私有**（SQL 的 `insert into storage.buckets ... public=false`；若 MCP 無法寫 storage.buckets，改由 Supabase 後台建立同名私有 bucket）。
- 用 `list_tables` / 查詢確認 `materials` 已建、RLS 已開、無 `{public}` 讀 policy。

- [ ] **Step 3: 部署正式站**

```bash
gh auth switch --user inrecmusic
git push origin feat/point2-carousel
npx vercel --prod
```

- [ ] **Step 4: 端到端驗證**

- 後台 `/admin` → 章節與單元管理 → 對某單元開「📎 講義」→ 上傳一份測試 PDF → 列表出現。
- 驗權限：未登入打 `GET /api/classroom/materials` → 401；已登入未購課 → 403。
- 已購課學員（或用 controller 具 enrollment 的測試帳號）在教室該單元 → 資訊列下方出現「📎 講義下載」→ 點擊 → 簽名 URL 開啟 PDF。
- 後台刪除該測試講義 → 教室不再顯示、Storage 物件移除。

---

## Self-Review

**Spec coverage（對照總 spec ① 節）：**
- `materials` 表（video_id NULL=通用）→ Task 2 ✅
- 私有 bucket `course-materials`＋伺服器上傳＋簽名 URL → Task 2/3/5 ✅
- 只收 PDF、magic byte、20MB → Task 1（`validateMaterialFile`）✅
- 後台 ChaptersUnitsPage 單元＋通用講義增刪 → Task 3/4 ✅
- 學員驗購課 + 該單元＋通用講義 + 簽名下載 → Task 5 ✅；教室 UI → Task 6 ✅
- 純函式測試 → Task 1；部署/e2e → Task 7 ✅

**Placeholder scan：** 無 TBD/TODO；路由與元件程式碼完整；驗證步驟具體。Task 4 對 `admin.module.css` class 名與插入點加了「以既有 modal 實際 class 為準」的實作提示（因該檔完整 class 清單未逐一列出），非 placeholder，而是明確的對照指示。

**Type consistency：** `validateMaterialFile` 回傳 `{ ok, ext } | { ok:false, error }`（Task 1 定義、Task 3 使用一致）；`materials` 欄位（`storage_path`/`video_id`/`title`/`file_size`/`sort_order`）跨 Task 2/3/5 一致；學員 API 回 `{ materials:[{id,title,file_size,video_id,url}] }`（Task 5 定義、Task 6 消費一致）；bucket 名 `course-materials` 三處一致。
