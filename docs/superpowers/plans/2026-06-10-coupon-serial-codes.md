# 優惠序號庫 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在後台「優惠券」頁面新增「序號庫」：批次產生一批限用一次的獨立序號（自動或手動），可在畫面顯示、複製、匯出 CSV，逐一發給現場活動來賓。

**Architecture:** 方案 A — 序號 = 批次化的 coupon。新增 `coupon_batches` 表存批次 metadata，`coupons` 表加 `batch_id`；每個序號是一筆 `usage_limit=1` 的 coupon。結帳/驗證/notify 累計流程完全沿用，零修改。產碼/正規化/CSV 等純邏輯抽到 `lib/serial-codes.js` 並用 vitest TDD；API 路由與後台 UI 依現有慣例以手動驗證。

**Tech Stack:** Next.js 14 App Router、Supabase（service role）、vitest、lucide-react、`app/admin/admin.module.css`。

---

## 設計參考

- Spec：`docs/superpowers/specs/2026-06-10-coupon-serial-codes-design.md`
- 結帳零修改的依據：`lib/plans.js` 的 `couponError()` 已檢查 `usage_limit/used`；`app/api/payuni/notify/route.js:111-123` 以 `fulfilled_at` 旗標冪等、付款成功才依 `code` 累計 `used`。序號 `usage_limit=1`，用一次即 `coupon_used_up`。

## 檔案結構

- Create: `lib/serial-codes.js` — 純邏輯：`generateCode` / `generateBatchCodes` / `normalizeManualCodes` / `codesToCsv`。單一職責，可單測。
- Create: `lib/serial-codes.test.js` — 上述純邏輯的 vitest。
- Create: `app/api/admin/coupon-batches/route.js` — 批次 GET（清單＋統計）/ POST（建立＋產碼）/ DELETE。
- Create: `app/api/admin/coupon-batches/[id]/codes/route.js` — GET 該批所有序號。
- Modify: `app/api/admin/coupons/route.js:11-14` — 一般優惠券列表查詢加 `.is("batch_id", null)`。
- Modify: `supabase-deploy.sql` — 追加 `coupon_batches` 表與 `coupons.batch_id`（idempotent）。
- Modify: `app/admin/page.jsx` — `CouponsPage`（約 908-1110 行）下方新增「序號庫」區塊與「新增批次」「展開序號清單」UI。
- Modify: `CLAUDE.md` — 補「序號庫」說明於優惠券段落。

---

## Task 1: 資料庫 schema（批次表 + batch_id）

**Files:**
- Modify: `supabase-deploy.sql`（檔尾追加）

- [ ] **Step 1: 在 `supabase-deploy.sql` 檔尾追加以下 SQL**

```sql

-- ════════════════════════════════════════
-- 優惠序號庫：coupon_batches 表 + coupons.batch_id
-- 序號 = usage_limit=1 的 coupon；結帳流程與優惠券共用
-- ════════════════════════════════════════
CREATE TABLE IF NOT EXISTS coupon_batches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,                   -- 例：2026 春季演奏會
  type        TEXT NOT NULL DEFAULT 'percent', -- 'percent' | 'fixed'
  value       INTEGER NOT NULL,                -- percent: 1-100；fixed: NT$
  prefix      TEXT,                            -- 序號前綴，例 LIVE
  note        TEXT,                            -- 活動備註
  starts_at   DATE,
  ends_at     DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE coupon_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_coupon_batches" ON coupon_batches;
CREATE POLICY "service_role_coupon_batches" ON coupon_batches
  USING (auth.role() = 'service_role');

ALTER TABLE coupons ADD COLUMN IF NOT EXISTS batch_id UUID
  REFERENCES coupon_batches(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS coupons_batch_idx ON coupons (batch_id);
```

- [ ] **Step 2: 本機驗證 SQL 語法（不需連線，僅人工確認 idempotent）**

確認所有語句皆為 `IF NOT EXISTS` / `DROP ... IF EXISTS` / `ADD COLUMN IF NOT EXISTS`，可重複執行。

- [ ] **Step 3: Commit**

```bash
git add supabase-deploy.sql
git commit -m "feat(db): 優惠序號庫 schema（coupon_batches + coupons.batch_id）"
```

> 部署時於 Supabase SQL Editor 執行更新後的 `supabase-deploy.sql`。

---

## Task 2: 純邏輯模組 `lib/serial-codes.js`（TDD）

**Files:**
- Create: `lib/serial-codes.js`
- Test: `lib/serial-codes.test.js`

- [ ] **Step 1: 寫失敗測試 `lib/serial-codes.test.js`**

```js
import { describe, it, expect } from "vitest";
import { generateCode, generateBatchCodes, normalizeManualCodes, codesToCsv } from "./serial-codes.js";

// 固定亂數來源讓測試可重現：回傳遞增的固定序列
function seqRng(values){ let i=0; return ()=> values[i++ % values.length]; }

describe("generateCode", () => {
  it("無前綴時只回傳指定長度的碼，且不含易混字 0 O 1 I", () => {
    const code = generateCode("", 8, () => 0); // rng=0 → 取字元集第一個
    expect(code).toHaveLength(8);
    expect(code).not.toMatch(/[0O1I]/);
  });
  it("有前綴時格式為 PREFIX-XXXX，前綴轉大寫", () => {
    const code = generateCode("live", 6, () => 0);
    expect(code).toMatch(/^LIVE-/);
    expect(code.slice(5)).toHaveLength(6);
  });
});

describe("generateBatchCodes", () => {
  it("產生指定數量、彼此唯一、且不與 existing 衝突的碼", () => {
    const existing = new Set(["LIVE-AAAA"]);
    const codes = generateBatchCodes({ prefix: "LIVE", quantity: 5, length: 4, existing });
    expect(codes).toHaveLength(5);
    expect(new Set(codes).size).toBe(5);
    for (const c of codes) expect(existing.has(c)).toBe(false);
  });
  it("數量超過上限 500 時丟錯", () => {
    expect(() => generateBatchCodes({ prefix: "X", quantity: 501 })).toThrow(/quantity/);
  });
});

describe("normalizeManualCodes", () => {
  it("逐行 trim、轉大寫、去空行、去重", () => {
    const out = normalizeManualCodes("abc\n  ABC \n\ndef\n");
    expect(out).toEqual(["ABC", "DEF"]);
  });
});

describe("codesToCsv", () => {
  it("輸出含表頭與每列欄位：序號,狀態,折扣,批次名稱", () => {
    const csv = codesToCsv(
      [{ code: "LIVE-AAAA", used: 0 }, { code: "LIVE-BBBB", used: 1 }],
      { discountLabel: "9 折", batchName: "演奏會" }
    );
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("序號,狀態,折扣,批次名稱");
    expect(lines[1]).toBe("LIVE-AAAA,未使用,9 折,演奏會");
    expect(lines[2]).toBe("LIVE-BBBB,已使用,9 折,演奏會");
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/serial-codes.test.js`
Expected: FAIL —「Failed to resolve import "./serial-codes.js"」或函式未定義。

- [ ] **Step 3: 實作 `lib/serial-codes.js`**

```js
// 優惠序號庫純邏輯：產碼 / 正規化 / CSV（無副作用，可單測）

// 排除易混字 0 O 1 I
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const MAX_BATCH_QUANTITY = 500;

// 產生單一隨機碼；rng 預設 Math.random（注入以利測試）
export function generateCode(prefix = "", length = 8, rng = Math.random) {
  let body = "";
  for (let i = 0; i < length; i++) {
    body += CHARS[Math.floor(rng() * CHARS.length)];
  }
  const p = String(prefix || "").trim().toUpperCase();
  return p ? `${p}-${body}` : body;
}

// 產生整批唯一碼，避開 existing（Set<string>）；碰撞重試
export function generateBatchCodes({ prefix = "", quantity, length = 8, existing = new Set(), rng = Math.random }) {
  const n = Math.round(Number(quantity));
  if (!Number.isFinite(n) || n <= 0) throw new Error("invalid_quantity");
  if (n > MAX_BATCH_QUANTITY) throw new Error(`quantity_over_${MAX_BATCH_QUANTITY}`);
  const seen = new Set(existing);
  const out = [];
  let guard = 0;
  const maxGuard = n * 50 + 1000;
  while (out.length < n) {
    if (guard++ > maxGuard) throw new Error("code_collision");
    const code = generateCode(prefix, length, rng);
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

// 手動輸入：逐行 trim、轉大寫、去空行、去重（保序）
export function normalizeManualCodes(raw) {
  const out = [];
  const seen = new Set();
  for (const line of String(raw || "").split(/\r?\n/)) {
    const c = line.trim().toUpperCase();
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

// 輸出 CSV：序號,狀態,折扣,批次名稱
export function codesToCsv(codes, { discountLabel, batchName }) {
  const esc = (s) => {
    const v = String(s ?? "");
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const header = "序號,狀態,折扣,批次名稱";
  const rows = codes.map((c) =>
    [esc(c.code), c.used ? "已使用" : "未使用", esc(discountLabel), esc(batchName)].join(",")
  );
  return [header, ...rows].join("\n") + "\n";
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/serial-codes.test.js`
Expected: PASS（全部測試綠燈）。

- [ ] **Step 5: Commit**

```bash
git add lib/serial-codes.js lib/serial-codes.test.js
git commit -m "feat(lib): 序號產生/正規化/CSV 純邏輯 + 單元測試"
```

---

## Task 3: 一般優惠券列表排除序號

**Files:**
- Modify: `app/api/admin/coupons/route.js`（GET，約 11-14 行）

- [ ] **Step 1: 在 GET 查詢加 `.is("batch_id", null)`**

將：

```js
  const { data, error } = await supabase
    .from("coupons")
    .select("*")
    .order("created_at", { ascending: false });
```

改為：

```js
  const { data, error } = await supabase
    .from("coupons")
    .select("*")
    .is("batch_id", null)              // 序號（批次碼）不出現在一般優惠券列表
    .order("created_at", { ascending: false });
```

- [ ] **Step 2: 啟動 dev 手動驗證**

Run: `npm run dev`，登入後台 → 優惠券頁，確認既有一般優惠券仍正常顯示（此時尚無序號，列表不變即可）。

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/coupons/route.js
git commit -m "feat(coupons): 一般優惠券列表排除批次序號(batch_id)"
```

---

## Task 4: 批次 API — `coupon-batches` 路由

**Files:**
- Create: `app/api/admin/coupon-batches/route.js`

- [ ] **Step 1: 建立 `app/api/admin/coupon-batches/route.js`**

```js
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { generateBatchCodes, normalizeManualCodes, MAX_BATCH_QUANTITY } from "@/lib/serial-codes";

// GET：批次清單 + 每批 total / used 統計
export async function GET(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const { data: batches, error } = await supabase
    .from("coupon_batches").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: codes } = await supabase.from("coupons").select("batch_id, used").not("batch_id", "is", null);
  const stats = {};
  for (const c of codes || []) {
    const s = stats[c.batch_id] || (stats[c.batch_id] = { total: 0, used: 0 });
    s.total += 1;
    if ((c.used || 0) > 0) s.used += 1;
  }
  const data = (batches || []).map((b) => ({ ...b, total: stats[b.id]?.total || 0, used: stats[b.id]?.used || 0 }));
  return NextResponse.json({ data });
}

// POST：建立批次 + 產碼（mode: 'auto' | 'manual'）
export async function POST(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const body = await req.json();
  const name  = String(body.name || "").trim();
  const type  = body.type === "fixed" ? "fixed" : "percent";
  const value = Number(body.value);
  const prefix = String(body.prefix || "").trim().toUpperCase() || null;
  const note  = String(body.note || "").trim() || null;
  const starts_at = body.starts_at || null;
  const ends_at   = body.ends_at || null;
  const mode  = body.mode === "manual" ? "manual" : "auto";

  if (!name) return NextResponse.json({ error: "missing_name" }, { status: 400 });
  if (!Number.isFinite(value) || value <= 0) return NextResponse.json({ error: "invalid_value" }, { status: 400 });
  if (type === "percent" && value > 100) return NextResponse.json({ error: "percent_over_100" }, { status: 400 });

  // 1) 決定要寫入的序號清單
  let wantCodes;
  if (mode === "manual") {
    wantCodes = normalizeManualCodes(body.codes);
    if (!wantCodes.length) return NextResponse.json({ error: "no_codes" }, { status: 400 });
    if (wantCodes.length > MAX_BATCH_QUANTITY) return NextResponse.json({ error: "too_many_codes" }, { status: 400 });
  } else {
    const quantity = Math.round(Number(body.quantity));
    if (!Number.isFinite(quantity) || quantity <= 0) return NextResponse.json({ error: "invalid_quantity" }, { status: 400 });
    if (quantity > MAX_BATCH_QUANTITY) return NextResponse.json({ error: "too_many_codes" }, { status: 400 });
    const { data: all } = await supabase.from("coupons").select("code");
    const existing = new Set((all || []).map((c) => c.code));
    try {
      wantCodes = generateBatchCodes({ prefix: prefix || "", quantity, existing });
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
  }

  // 2) 唯一性檢查（手動碼可能與既有碼衝突）
  const { data: dup } = await supabase.from("coupons").select("code").in("code", wantCodes);
  if (dup && dup.length) {
    return NextResponse.json({ error: "code_exists", conflicts: dup.map((d) => d.code) }, { status: 409 });
  }

  // 3) 寫入批次
  const { data: batch, error: bErr } = await supabase.from("coupon_batches")
    .insert({ name, type, value: Math.round(value), prefix, note, starts_at, ends_at })
    .select().single();
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });

  // 4) 寫入序號（usage_limit=1）
  const rows = wantCodes.map((code) => ({
    name, code, type, value: Math.round(value),
    usage_limit: 1, status: "active", starts_at, ends_at, batch_id: batch.id,
  }));
  const { error: cErr } = await supabase.from("coupons").insert(rows);
  if (cErr) {
    // 回滾批次，避免留下空批次
    await supabase.from("coupon_batches").delete().eq("id", batch.id);
    if (cErr.code === "23505") return NextResponse.json({ error: "code_exists" }, { status: 409 });
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }

  return NextResponse.json({ data: { ...batch, total: rows.length, used: 0 } });
}

// DELETE ?id= ：刪批次（CASCADE 連帶刪序號）
export async function DELETE(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const { error } = await supabase.from("coupon_batches").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: 手動驗證（需先在 Supabase 執行 Task 1 的 SQL）**

用後台登入後的 token 測試（或於 UI 完成後一起驗證）。以 curl 範例（替換 `<TOKEN>`）：

```bash
curl -s -X POST http://localhost:3000/api/admin/coupon-batches \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"name":"測試場","type":"percent","value":90,"prefix":"LIVE","mode":"auto","quantity":3}'
```
Expected: 200，回傳 `data` 含 `id`、`total:3`、`used:0`；Supabase `coupons` 出現 3 筆 `batch_id` 相符、`usage_limit=1` 的碼。

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/coupon-batches/route.js
git commit -m "feat(api): 優惠序號批次 CRUD（自動產生/手動補建）"
```

---

## Task 5: 批次序號清單 API

**Files:**
- Create: `app/api/admin/coupon-batches/[id]/codes/route.js`

- [ ] **Step 1: 建立 `app/api/admin/coupon-batches/[id]/codes/route.js`**

```js
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";

// GET：取得某批次所有序號（含 used 狀態），供畫面顯示 / 複製 / CSV
export async function GET(req, { params }) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const { id } = params;
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const { data, error } = await supabase
    .from("coupons")
    .select("id, code, used, type, value")
    .eq("batch_id", id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data || [] });
}
```

- [ ] **Step 2: 手動驗證**

```bash
curl -s http://localhost:3000/api/admin/coupon-batches/<BATCH_ID>/codes \
  -H "Authorization: Bearer <TOKEN>"
```
Expected: 200，`data` 為該批序號陣列，每筆含 `code`、`used`。

- [ ] **Step 3: Commit**

```bash
git add "app/api/admin/coupon-batches/[id]/codes/route.js"
git commit -m "feat(api): 取得批次序號清單"
```

---

## Task 6: 後台 UI — 序號庫區塊

**Files:**
- Modify: `app/admin/page.jsx`（`CouponsPage` 內，現有優惠券 `panel` 之後、Modal 之前插入序號庫區塊與相關 state/函式）

> 沿用既有慣例：`_api()` 發 API、`styles.*` 樣式、`StatCard`、`showToast`、Modal 結構（參考同檔 `showCreate` / `deleteId` 寫法）、`navigator.clipboard.writeText` 複製。icon 由檔頭 `lucide-react` 匯入（`Plus / Copy / Trash2 / Download / RefreshCw / Percent / Ticket` 已存在）。

- [ ] **Step 1: 在 `CouponsPage` 元件頂部新增序號庫 state 與資料抓取**

在現有 `const [formErr,setFormErr]=useState("");`（約 916 行）之後加入：

```js
  // ── 序號庫 ──
  const [batches,setBatches]=useState([]);
  const [batchLoading,setBatchLoading]=useState(false);
  const [showBatchCreate,setShowBatchCreate]=useState(false);
  const [batchSaving,setBatchSaving]=useState(false);
  const [batchErr,setBatchErr]=useState("");
  const [batchForm,setBatchForm]=useState({name:"",type:"percent",value:"",prefix:"",note:"",start:"",end:"",mode:"auto",quantity:"50",codes:""});
  const [expandId,setExpandId]=useState(null);
  const [expandCodes,setExpandCodes]=useState([]);
  const [expandLoading,setExpandLoading]=useState(false);
  const [deleteBatch,setDeleteBatch]=useState(null);

  const fetchBatches=useCallback(async()=>{
    setBatchLoading(true);
    try{const r=await _api("/api/admin/coupon-batches");const{data}=await r.json();setBatches(data||[]);}
    catch{setBatches([]);}
    finally{setBatchLoading(false);}
  },[]);
  useEffect(()=>{fetchBatches();},[fetchBatches]);

  function discountLabel(b){return b.type==="percent"?`${b.value}% 折扣`:`折 NT$${b.value}`;}

  async function toggleExpand(b){
    if(expandId===b.id){setExpandId(null);setExpandCodes([]);return;}
    setExpandId(b.id);setExpandLoading(true);setExpandCodes([]);
    try{const r=await _api(`/api/admin/coupon-batches/${b.id}/codes`);const{data}=await r.json();setExpandCodes(data||[]);}
    catch{setExpandCodes([]);}
    finally{setExpandLoading(false);}
  }

  async function handleBatchCreate(e){
    e.preventDefault();setBatchErr("");
    if(!batchForm.name.trim()){setBatchErr("請輸入批次名稱");return;}
    if(!batchForm.value||isNaN(batchForm.value)||Number(batchForm.value)<=0){setBatchErr("請輸入有效的折扣值");return;}
    if(batchForm.type==="percent"&&Number(batchForm.value)>100){setBatchErr("百分比折扣不可超過 100");return;}
    if(batchForm.mode==="auto"&&(!batchForm.quantity||Number(batchForm.quantity)<=0)){setBatchErr("請輸入產生數量");return;}
    if(batchForm.mode==="manual"&&!batchForm.codes.trim()){setBatchErr("請貼上序號（一行一組）");return;}
    setBatchSaving(true);
    try{
      const r=await _api("/api/admin/coupon-batches",{method:"POST",body:JSON.stringify({
        name:batchForm.name.trim(),type:batchForm.type,value:Number(batchForm.value),
        prefix:batchForm.prefix.trim()||null,note:batchForm.note.trim()||null,
        starts_at:batchForm.start||null,ends_at:batchForm.end||null,
        mode:batchForm.mode,
        quantity:batchForm.mode==="auto"?Number(batchForm.quantity):undefined,
        codes:batchForm.mode==="manual"?batchForm.codes:undefined,
      })});
      const d=await r.json();
      if(!r.ok){
        const msg=d.error==="code_exists"?`序號重複：${(d.conflicts||[]).slice(0,5).join(", ")}`
          :d.error==="too_many_codes"?"數量超過上限 500"
          :d.error==="code_collision"?"自動產碼碰撞過多，請換前綴或減少數量"
          :d.error||"建立失敗";
        throw new Error(msg);
      }
      showToast?.(`✅ 已建立批次，共 ${d.data.total} 組序號`);
      setShowBatchCreate(false);
      setBatchForm({name:"",type:"percent",value:"",prefix:"",note:"",start:"",end:"",mode:"auto",quantity:"50",codes:""});
      fetchBatches();
    }catch(err){setBatchErr(err.message);}
    finally{setBatchSaving(false);}
  }

  async function confirmDeleteBatch(){
    try{
      const r=await _api(`/api/admin/coupon-batches?id=${deleteBatch.id}`,{method:"DELETE"});
      if(!r.ok)throw new Error();
      showToast?.("✅ 批次已刪除");setDeleteBatch(null);
      if(expandId===deleteBatch.id){setExpandId(null);setExpandCodes([]);}
      fetchBatches();
    }catch{showToast?.("❌ 刪除失敗");}
  }

  function copyAllCodes(){
    if(!expandCodes.length)return;
    navigator.clipboard?.writeText(expandCodes.map(c=>c.code).join("\n"));
    showToast?.("✅ 已複製全部序號");
  }

  function downloadCsv(b){
    const dl=discountLabel(b);
    const esc=(s)=>{const v=String(s??"");return /[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;};
    const header="序號,狀態,折扣,批次名稱";
    const lines=expandCodes.map(c=>[esc(c.code),c.used?"已使用":"未使用",esc(dl),esc(b.name)].join(","));
    const csv="﻿"+[header,...lines].join("\n")+"\n"; // BOM 讓 Excel 正確顯示中文
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=`序號_${b.name}.csv`;a.click();
    URL.revokeObjectURL(url);
  }
```

- [ ] **Step 2: 在現有優惠券 `panel`（約 998-1040 行那個 `</div>` 結束的 panel）之後、Modal 區塊之前，插入序號庫 UI**

```jsx
      {/* ── 序號庫 ── */}
      <div className={styles.pageHeader} style={{marginTop:32}}>
        <div><h2 style={{margin:0}}>序號庫</h2><p>現場活動限定：批次產生獨立序號，每組限用一次</p></div>
        <div className={styles.pageActions}>
          <button className={styles.btnSmall} onClick={fetchBatches}><RefreshCw size={13}/> 重新整理</button>
          <button className={styles.btnPrimary} onClick={()=>setShowBatchCreate(true)}><Plus size={14}/> 新增批次</button>
        </div>
      </div>
      <div className={styles.panel}>
        <div className={styles.panelHead}><h2>批次列表</h2><span className={styles.dim}>共 {batches.length} 批</span></div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>批次名稱</th><th>折扣</th><th>已用 / 總數</th><th>前綴</th><th>有效期間</th><th>備註</th><th>操作</th></tr></thead>
            <tbody>
              {batchLoading?<tr><td colSpan={7} className={styles.empty}>載入中…</td></tr>
              :!batches.length?<tr><td colSpan={7} className={styles.empty}><span className={styles.emptyIcon}>🎫</span><span className={styles.emptyTitle}>還沒有任何序號批次</span><span className={styles.emptySub}>新增批次來產生現場活動序號</span></td></tr>
              :batches.map(b=>(
                <Fragment key={b.id}>
                <tr>
                  <td><strong>{b.name}</strong></td>
                  <td>
                    <span className={styles.discountBadge} style={{background:b.type==="percent"?"#eff6ff":"#fef3c7",color:b.type==="percent"?"#1d4ed8":"#92400e"}}>
                      {b.type==="percent"?<><Percent size={11}/> {b.value}%</>:<>NT$ {b.value}</>}
                    </span>
                  </td>
                  <td><span style={{fontWeight:800}}>{b.used}</span> / {b.total}</td>
                  <td className={styles.dim}>{b.prefix||"—"}</td>
                  <td className={styles.dim} style={{fontSize:12}}>{b.starts_at||"—"} ~ {b.ends_at||"—"}</td>
                  <td className={styles.dim} style={{fontSize:12,maxWidth:160}}>{b.note||"—"}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <button className={styles.btnSmall} onClick={()=>toggleExpand(b)}>{expandId===b.id?"收合":"查看序號"}</button>
                      <button className={`${styles.btnSmall} ${styles.btnDanger}`} onClick={()=>setDeleteBatch(b)}><Trash2 size={12}/></button>
                    </div>
                  </td>
                </tr>
                {expandId===b.id&&(
                  <tr>
                    <td colSpan={7} style={{background:"#f8fafc"}}>
                      {expandLoading?<div className={styles.dim} style={{padding:12}}>載入序號中…</div>:(
                        <div style={{padding:"8px 4px"}}>
                          <div style={{display:"flex",gap:8,marginBottom:10}}>
                            <button className={styles.btnSmall} onClick={copyAllCodes}><Copy size={12}/> 全選複製</button>
                            <button className={styles.btnSmall} onClick={()=>downloadCsv(b)}><Download size={12}/> 下載 CSV</button>
                            <span className={styles.dim} style={{alignSelf:"center"}}>共 {expandCodes.length} 組</span>
                          </div>
                          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                            {expandCodes.map(c=>(
                              <span key={c.id} style={{display:"inline-flex",alignItems:"center",gap:6,background:c.used?"#f1f5f9":"#fff",border:"1px solid #e2e8f0",borderRadius:6,padding:"3px 8px",fontSize:12}}>
                                <code style={{fontWeight:700,letterSpacing:1,textDecoration:c.used?"line-through":"none",color:c.used?"#94a3b8":"#0f172a"}}>{c.code}</code>
                                <span className={styles.dim} style={{fontSize:11}}>{c.used?"已使用":"未使用"}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
```

- [ ] **Step 3: 在現有刪除 Modal（`deleteId`，約 1096-1104 行）之後、`CouponsPage` 的 `</div>` 收尾前，加入「新增批次」Modal 與「刪除批次」確認 Modal**

> class 已對齊既有「新增優惠券」Modal：外層 `styles.modalOverlay` + `styles.modalCard`、header 用 inline flex、`styles.formRow` 包 `styles.formGroup`、select 用 `styles.selectInput`、底部按鈕列 `styles.modalActions`、危險填色按鈕 `styles.btnDangerFill`。

```jsx
      {/* Batch create modal */}
      {showBatchCreate&&(
        <div className={styles.modalOverlay} onClick={()=>!batchSaving&&setShowBatchCreate(false)}>
          <div className={styles.modalCard} style={{width:"min(560px,100%)"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <h3 style={{margin:0,fontSize:18}}>新增序號批次</h3>
              <button className={styles.iconBtn} onClick={()=>setShowBatchCreate(false)}><X size={18}/></button>
            </div>
            <form onSubmit={handleBatchCreate} style={{display:"grid",gap:14}}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}><label>批次名稱 *</label><input className={styles.input} value={batchForm.name} onChange={e=>setBatchForm(p=>({...p,name:e.target.value}))} placeholder="例：2026 春季演奏會"/></div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup} style={{flex:1}}>
                  <label>折扣類型</label>
                  <select className={styles.selectInput} style={{width:"100%"}} value={batchForm.type} onChange={e=>setBatchForm(p=>({...p,type:e.target.value}))}>
                    <option value="percent">百分比折扣 (%)</option>
                    <option value="fixed">固定金額折扣 (NT$)</option>
                  </select>
                </div>
                <div className={styles.formGroup} style={{flex:1}}>
                  <label>折扣值 * {batchForm.type==="percent"?"(%)":"(NT$)"}</label>
                  <input className={styles.input} type="number" min="1" value={batchForm.value} onChange={e=>setBatchForm(p=>({...p,value:e.target.value}))} placeholder={batchForm.type==="percent"?"90":"500"}/>
                </div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup} style={{flex:1}}>
                  <label>產生方式</label>
                  <select className={styles.selectInput} style={{width:"100%"}} value={batchForm.mode} onChange={e=>setBatchForm(p=>({...p,mode:e.target.value}))}>
                    <option value="auto">自動產生</option><option value="manual">手動貼上</option>
                  </select>
                </div>
              </div>
              {batchForm.mode==="auto"?(
                <div className={styles.formRow}>
                  <div className={styles.formGroup} style={{flex:1}}><label>前綴（選填）</label><input className={styles.input} value={batchForm.prefix} onChange={e=>setBatchForm(p=>({...p,prefix:e.target.value.toUpperCase()}))} placeholder="例：LIVE"/></div>
                  <div className={styles.formGroup} style={{flex:1}}><label>產生數量 *（上限 500）</label><input className={styles.input} type="number" min="1" max="500" value={batchForm.quantity} onChange={e=>setBatchForm(p=>({...p,quantity:e.target.value}))} placeholder="50"/></div>
                </div>
              ):(
                <div className={styles.formRow}>
                  <div className={styles.formGroup} style={{flex:1}}><label>序號（一行一組）*</label><textarea className={styles.input} rows={5} value={batchForm.codes} onChange={e=>setBatchForm(p=>({...p,codes:e.target.value}))} placeholder={"LIVE-AAAA\nLIVE-BBBB"}/></div>
                </div>
              )}
              <div className={styles.formRow}>
                <div className={styles.formGroup} style={{flex:1}}><label>開始日期</label><input className={styles.input} type="date" value={batchForm.start} onChange={e=>setBatchForm(p=>({...p,start:e.target.value}))}/></div>
                <div className={styles.formGroup} style={{flex:1}}><label>結束日期</label><input className={styles.input} type="date" value={batchForm.end} onChange={e=>setBatchForm(p=>({...p,end:e.target.value}))}/></div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}><label>活動備註（選填）</label><input className={styles.input} value={batchForm.note} onChange={e=>setBatchForm(p=>({...p,note:e.target.value}))} placeholder="例：現場演奏會發放"/></div>
              </div>
              {batchErr&&<p style={{color:"#dc2626",fontSize:13,margin:0,fontWeight:700}}>{batchErr}</p>}
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnSmall} onClick={()=>setShowBatchCreate(false)}>取消</button>
                <button type="submit" className={styles.btnPrimary} disabled={batchSaving}>{batchSaving?"建立中…":"建立批次並產生序號"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch delete confirm */}
      {deleteBatch&&(
        <div className={styles.modalOverlay} onClick={()=>setDeleteBatch(null)}>
          <div className={styles.modalCard} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:"0 0 8px",fontSize:17}}>確認刪除批次</h3>
            <p style={{margin:"0 0 20px",color:"#64748b",fontSize:14}}>將刪除「{deleteBatch.name}」及其 {deleteBatch.total} 組序號（已使用 {deleteBatch.used} 組）。已成立訂單不受影響，但未使用的序號將失效，無法復原。</p>
            <div className={styles.modalActions}><button className={styles.btnSmall} onClick={()=>setDeleteBatch(null)}>取消</button><button className={`${styles.btnPrimary} ${styles.btnDangerFill}`} onClick={confirmDeleteBatch}>確認刪除</button></div>
          </div>
        </div>
      )}
```

- [ ] **Step 4: 手動驗證完整流程**

Run: `npm run dev`，登入後台 → 優惠券頁：
1. 序號庫區「新增批次」→ 自動產生：名稱、9折(percent 90)、前綴 LIVE、數量 5 → 建立成功，列表出現批次，已用 0/5。
2. 「查看序號」展開 → 顯示 5 組 `LIVE-XXXX`、全為「未使用」。
3. 「全選複製」→ 貼到別處確認 5 行。「下載 CSV」→ 開啟確認表頭與中文正常。
4. 「新增批次」→ 手動貼上 2 行自訂碼 → 建立成功。
5. 貼上與既有碼重複 → 顯示「序號重複：…」。
6. 刪除批次 → 確認 Modal 文案正確、刪除後列表移除。
7. 切到頁面上方「優惠券列表」→ 確認序號不混入一般優惠券。

- [ ] **Step 5: Commit**

```bash
git add app/admin/page.jsx
git commit -m "feat(admin): 優惠券頁新增序號庫 UI（批次產生/複製/CSV）"
```

---

## Task 7: 更新 CLAUDE.md 文件

**Files:**
- Modify: `CLAUDE.md`（「優惠券」段落後）

- [ ] **Step 1: 在 CLAUDE.md「優惠券」說明附近補上序號庫說明**

於 `### coupons 資料表（優惠券）` 區塊後加入：

```markdown
### 優惠序號庫（coupon_batches）

現場活動限定序號：每組序號是一筆 `usage_limit=1` 的 `coupons`，靠 `batch_id` 歸入 `coupon_batches`（批次 metadata：折扣、前綴、備註、起訖）。**結帳/驗證/notify 累計流程與優惠券完全共用，零修改**——序號用一次即 `coupon_used_up` 失效。後台「優惠券」頁下方「序號庫」可批次自動產生（前綴＋數量，上限 500，排除易混字 0/O/1/I）或手動補建、查看清單、全選複製、下載 CSV。一般優惠券列表以 `.is("batch_id", null)` 排除序號。產碼/CSV 純邏輯在 `lib/serial-codes.js`。
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md 補優惠序號庫說明"
```

---

## 完成後

- 於 Supabase SQL Editor 執行更新後的 `supabase-deploy.sql`（Task 1）。
- 部署：`npx vercel --prod`（Vercel 未連動 GitHub，需手動）。

## Self-Review 紀錄

- **Spec 覆蓋**：批次不同折扣(Task 4 POST type/value)✓；限用一次(usage_limit=1, Task 4)✓；自動+手動(Task 2/4 mode)✓；前綴(Task 2/4)✓；畫面顯示+複製+CSV(Task 6)✓；同頁面(Task 6)✓；結帳零修改(Task 3 僅排除查詢)✓；數量上限500/碰撞/唯一性(Task 2/4)✓；刪批次CASCADE+警示(Task 1/4/6)✓；DB(Task 1)✓。
- **型別/命名一致**：`generateBatchCodes/normalizeManualCodes/codesToCsv/MAX_BATCH_QUANTITY` 於 Task 2 定義並於 Task 4 引用一致；`batch_id`、`mode='auto'|'manual'`、`coupon_batches` 全程一致。
- **Placeholder**：UI Task 6 Step 3 標註「以既有 Modal class 為準對齊」為實作核對指示，非 placeholder。
