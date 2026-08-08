# 學員資料頁 實作計畫（核心第一階段）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓學員在 `student_profiles` 表維護個人資料（核心＋選配），首次進教室引導填核心、帳號頁隨時補改，隱私合規，後台可單一檢視與名單篩選。

**Architecture:** 新表 `student_profiles`（`user_id` PK ＋ `email` 供後台 join、service_role RLS）。純邏輯集中 `lib/student-profile.js`（驗證/核心完整判定/預填），供前台引導、帳號頁、學員 API 三處共用。學員端 `/api/classroom/profile`（GET＋PATCH，`requireClassroomAuth` 綁本人）。前台兩入口：教室首次引導 gate、帳號頁區塊。後台擴充既有 `students`／`customer` 兩支（不新增 admin route）。

**Tech Stack:** Next.js 14 App Router、Supabase service-role client、vitest 純函式測試、既有 `requireClassroomAuth`／`verifyAdminToken`／`_api`／`site_content` 覆寫慣例。

## Global Constraints

- **欄位**：核心＝`real_name`／`phone`／`level`（必填）；選配＝`goal`／`source`／`equipment`／`age_group`／`gender`。
- **選項白名單**：`level` ∈ `none|little|some`；`source` ∈ `ig|friend|concert|search|other`；`equipment` ∈ `acoustic|digital|none`；`age_group` ∈ `under18|18_29|30_44|45_59|60plus`；`gender` ∈ `male|female|other|prefer_not`。台灣手機 `^09\d{8}$`；`goal` 上限 500 字。
- **資料表**：`student_profiles`，`user_id UUID PK REFERENCES auth.users(id)` ＋ `email TEXT`，**service_role RLS only**；前端 **0 處 anon 直讀**（含 PII，一律經 service-role 後端）。
- **學員 API**：`requireClassroomAuth(req, { requireCourse: false })`（帳號頁未購課也能維護）；`user_id`／`email` **一律取自 JWT**（`g.user.id`／`g.user.email`），不信任前端傳入。
- **隱私**：表單底部告知聲明＋連 `/privacy`；隱私政策補條文；首次送出寫 `consent_at`（已有則不覆寫）。**不**強制勾選同意框。
- **後台**：擴充既有 `/api/admin/students`、`/api/admin/customer` 與其頁面；前端 `_api()`、後端 `verifyAdminToken`。
- **測試**：純邏輯抽 `lib/*.js` 用 vitest；route/UI 靠純函式測試＋build＋手動驗證。

---

### Task 1: `student_profiles` 表

**Files:**
- Create: `supabase-student-profiles.sql`
- Modify: `CLAUDE.md`（「部署需執行的 SQL」段，插在 `supabase-capi.sql` 之後、`supabase-hardening.sql` 之前）

**Interfaces:**
- Produces: 表 `student_profiles(user_id PK, email, real_name, phone, level, goal, source, equipment, age_group, gender, consent_at, created_at, updated_at)`，service_role RLS。

- [ ] **Step 1: 建 SQL 檔**

Create `supabase-student-profiles.sql`（比照 `supabase-classroom-features.sql` 的 notes 表 pattern，含 RLS＋updated_at trigger，idempotent）：

```sql
-- 學員資料頁：student_profiles（一人一列、service_role RLS、含 PII 切勿開公開讀）
CREATE TABLE IF NOT EXISTS student_profiles (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  real_name  TEXT,
  phone      TEXT,
  level      TEXT,   -- none|little|some
  goal       TEXT,
  source     TEXT,   -- ig|friend|concert|search|other
  equipment  TEXT,   -- acoustic|digital|none
  age_group  TEXT,   -- under18|18_29|30_44|45_59|60plus
  gender     TEXT,   -- male|female|other|prefer_not
  consent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS student_profiles_email_idx ON student_profiles (email);

ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_student_profiles" ON student_profiles;
CREATE POLICY "service_role_student_profiles" ON student_profiles
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS student_profiles_updated_at ON student_profiles;
CREATE TRIGGER student_profiles_updated_at BEFORE UPDATE ON student_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 2: 在正式 DB 執行**（透過 Supabase MCP `apply_migration` 或 SQL editor 跑上面全文；idempotent 可重複）。驗證：`SELECT count(*) FROM student_profiles;` 回 `0` 不報錯。

- [ ] **Step 3: 更新 CLAUDE.md 部署順序**

在 `CLAUDE.md`「部署需執行的 SQL」鏈中 `supabase-capi.sql` 之後、`supabase-hardening.sql（必跑，最後一步）` 之前，補一行：
`→ **supabase-student-profiles.sql**（學員資料頁：student_profiles 表，自帶 RLS service_role policy，idempotent）`

- [ ] **Step 4: Commit**

```bash
git -C ~/code/inrecord add supabase-student-profiles.sql CLAUDE.md
git -C ~/code/inrecord commit -m "feat: student_profiles 表（service_role RLS）＋部署順序"
```

---

### Task 2: `lib/student-profile.js` 純函式（TDD）

**Files:**
- Create: `lib/student-profile.js`
- Test: `lib/student-profile.test.js`

**Interfaces:**
- Produces:
  - `LEVELS`/`SOURCES`/`EQUIPMENT`/`AGE_GROUPS`/`GENDERS`（string[] 白名單）
  - `isProfileCoreComplete(p) => boolean`（real_name＋phone＋合法 level 皆有）
  - `validateProfile(input) => { ok:true, value } | { ok:false, error }`
  - `mergePrefill(profile, order) => {8 欄字串}`（訂單 buyer_name/phone 補空）

- [ ] **Step 1: 寫失敗測試**

Create `lib/student-profile.test.js`：

```js
import { describe, it, expect } from "vitest";
import { isProfileCoreComplete, validateProfile, mergePrefill } from "./student-profile.js";

describe("isProfileCoreComplete", () => {
  it("核心三欄齊 → true", () => {
    expect(isProfileCoreComplete({ real_name: "王小明", phone: "0912345678", level: "none" })).toBe(true);
  });
  it("缺任一核心 → false", () => {
    expect(isProfileCoreComplete({ real_name: "", phone: "0912345678", level: "none" })).toBe(false);
    expect(isProfileCoreComplete({ real_name: "A", phone: "", level: "none" })).toBe(false);
    expect(isProfileCoreComplete({ real_name: "A", phone: "0912345678", level: "bad" })).toBe(false);
    expect(isProfileCoreComplete(null)).toBe(false);
  });
});

describe("validateProfile", () => {
  it("核心齊＋選配空 → ok，選配為 null", () => {
    const r = validateProfile({ real_name: " 王小明 ", phone: "0912345678", level: "some" });
    expect(r.ok).toBe(true);
    expect(r.value).toMatchObject({ real_name: "王小明", phone: "0912345678", level: "some",
      goal: null, source: null, equipment: null, age_group: null, gender: null });
  });
  it("手機格式錯 → invalid_phone", () => {
    expect(validateProfile({ real_name: "A", phone: "12345", level: "none" })).toEqual({ ok: false, error: "invalid_phone" });
  });
  it("缺姓名 → missing_real_name；level 非法 → invalid_level", () => {
    expect(validateProfile({ real_name: "", phone: "0912345678", level: "none" }).error).toBe("missing_real_name");
    expect(validateProfile({ real_name: "A", phone: "0912345678", level: "x" }).error).toBe("invalid_level");
  });
  it("選配給非白名單值 → invalid_option", () => {
    expect(validateProfile({ real_name: "A", phone: "0912345678", level: "none", gender: "xx" }).error).toBe("invalid_option");
  });
  it("goal 超過 500 字截斷", () => {
    const r = validateProfile({ real_name: "A", phone: "0912345678", level: "none", goal: "x".repeat(600) });
    expect(r.value.goal.length).toBe(500);
  });
});

describe("mergePrefill", () => {
  it("profile 空 → 用訂單 buyer_name/phone 補", () => {
    expect(mergePrefill(null, { buyer_name: "陳大文", phone: "0922333444" }))
      .toMatchObject({ real_name: "陳大文", phone: "0922333444", level: "" });
  });
  it("profile 有值 → 不被訂單覆寫", () => {
    expect(mergePrefill({ real_name: "原本", phone: "0911111111" }, { buyer_name: "訂單", phone: "0999" }))
      .toMatchObject({ real_name: "原本", phone: "0911111111" });
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/student-profile.test.js` → FAIL（找不到模組）

- [ ] **Step 3: 實作**

Create `lib/student-profile.js`：

```js
// lib/student-profile.js — 學員資料驗證/核心完整判定/預填（純函式，可測；前台引導、帳號頁、後端共用）
export const LEVELS = ["none", "little", "some"];
export const SOURCES = ["ig", "friend", "concert", "search", "other"];
export const EQUIPMENT = ["acoustic", "digital", "none"];
export const AGE_GROUPS = ["under18", "18_29", "30_44", "45_59", "60plus"];
export const GENDERS = ["male", "female", "other", "prefer_not"];
const GOAL_MAX = 500;
const PHONE_RE = /^09\d{8}$/;

export function isProfileCoreComplete(p) {
  return !!p
    && !!String(p.real_name ?? "").trim()
    && !!String(p.phone ?? "").trim()
    && LEVELS.includes(p.level);
}

export function validateProfile(input = {}) {
  const real_name = String(input.real_name ?? "").trim();
  const phone = String(input.phone ?? "").trim();
  const level = input.level ?? null;
  if (!real_name) return { ok: false, error: "missing_real_name" };
  if (!PHONE_RE.test(phone)) return { ok: false, error: "invalid_phone" };
  if (!LEVELS.includes(level)) return { ok: false, error: "invalid_level" };

  const opt = (val, list) => {
    const v = val == null || val === "" ? null : String(val);
    return v !== null && !list.includes(v) ? { bad: true } : { v };
  };
  const source = opt(input.source, SOURCES);
  const equipment = opt(input.equipment, EQUIPMENT);
  const age_group = opt(input.age_group, AGE_GROUPS);
  const gender = opt(input.gender, GENDERS);
  if (source.bad || equipment.bad || age_group.bad || gender.bad) return { ok: false, error: "invalid_option" };

  const goal = String(input.goal ?? "").trim().slice(0, GOAL_MAX) || null;
  return { ok: true, value: { real_name, phone, level, goal,
    source: source.v, equipment: equipment.v, age_group: age_group.v, gender: gender.v } };
}

export function mergePrefill(profile, order) {
  const p = profile || {};
  return {
    real_name: p.real_name || order?.buyer_name || "",
    phone: p.phone || order?.phone || "",
    level: p.level || "",
    goal: p.goal || "", source: p.source || "", equipment: p.equipment || "",
    age_group: p.age_group || "", gender: p.gender || "",
  };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/student-profile.test.js` → PASS（全部）

- [ ] **Step 5: Commit**

```bash
git -C ~/code/inrecord add lib/student-profile.js lib/student-profile.test.js
git -C ~/code/inrecord commit -m "feat: lib/student-profile 純函式（驗證/核心完整/預填）"
```

---

### Task 3: 學員 profile API `/api/classroom/profile`

**Files:**
- Create: `app/api/classroom/profile/route.js`

**Interfaces:**
- Consumes: `requireClassroomAuth`（`lib/classroom-auth.js`）、`validateProfile`/`mergePrefill`（Task 2）
- Produces:
  - `GET /api/classroom/profile` → `{ profile: row|null, prefill: {8 欄} }`
  - `PATCH /api/classroom/profile` `{8 欄}` → `{ ok } | { ok:false, error }`（upsert 本人，首次寫 consent_at）

- [ ] **Step 1: 建 route**（比照 `app/api/classroom/notes/route.js` 的 requireClassroomAuth 用法）

Create `app/api/classroom/profile/route.js`：

```js
import { NextResponse } from "next/server";
import { requireClassroomAuth } from "@/lib/classroom-auth";
import { validateProfile, mergePrefill } from "@/lib/student-profile";

export async function GET(req) {
  const g = await requireClassroomAuth(req, { requireCourse: false });
  if (g.res) return g.res;
  const { user, supabase } = g;

  const { data: profile } = await supabase
    .from("student_profiles").select("*").eq("user_id", user.id).maybeSingle();

  // 預填候選：最近一筆已付款訂單的 buyer_name/phone
  const { data: order } = await supabase
    .from("orders").select("buyer_name, phone")
    .eq("email", user.email).eq("status", "paid")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  return NextResponse.json({ profile: profile || null, prefill: mergePrefill(profile, order) });
}

export async function PATCH(req) {
  const g = await requireClassroomAuth(req, { requireCourse: false });
  if (g.res) return g.res;
  const { user, supabase } = g;

  const body = await req.json().catch(() => ({}));
  const v = validateProfile(body);
  if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });

  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("student_profiles").select("consent_at").eq("user_id", user.id).maybeSingle();
  const consent_at = existing?.consent_at || now;

  const { error } = await supabase.from("student_profiles").upsert(
    { user_id: user.id, email: user.email, ...v.value, consent_at, updated_at: now },
    { onConflict: "user_id" }
  );
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: build 驗證**

Run: `cd ~/code/inrecord && npx next build 2>&1 | tail -20`（環境 hang 則跑 `npx vitest run lib/student-profile.test.js` 並註明 build 以 Vercel 為準）。

- [ ] **Step 3: 手動驗證閘**（部署 preview 後）：未帶 token `GET /api/classroom/profile` → 401。

- [ ] **Step 4: Commit**

```bash
git -C ~/code/inrecord add app/api/classroom/profile/route.js
git -C ~/code/inrecord commit -m "feat: 學員 profile API（GET 帶預填＋PATCH upsert 本人）"
```

---

### Task 4: 帳號頁「我的學員資料」區塊

**Files:**
- Modify: `app/classroom/account/page.jsx`（在 142↔143 之間插新區塊；讀仿 38–52、寫仿 54–71、樣式用 75–78）

**Interfaces:**
- Consumes: `GET`/`PATCH /api/classroom/profile`（Task 3）、`validateProfile` 的白名單常數（Task 2，用於下拉選項）

- [ ] **Step 1: 匯入常數＋state**

在 `app/classroom/account/page.jsx` 頂部 import 加：
```js
import { LEVELS, SOURCES, EQUIPMENT, AGE_GROUPS, GENDERS } from "@/lib/student-profile";
```
在元件內（現有 `name`/`saved` state 附近）加：
```js
const [prof, setProf] = useState({ real_name:"", phone:"", level:"", goal:"", source:"", equipment:"", age_group:"", gender:"" });
const [profSaving, setProfSaving] = useState(false);
const [profSaved, setProfSaved] = useState(false);
const [profErr, setProfErr] = useState("");
```

- [ ] **Step 2: 讀 profile**（新 effect，仿現有 38–52 抓 orders 的 token→Bearer fetch）

```js
useEffect(() => {
  (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;
    const r = await fetch("/api/classroom/profile", { headers: { Authorization: `Bearer ${token}` } });
    const d = await r.json().catch(() => ({}));
    if (d.prefill) setProf(d.prefill); // 預填：帶入既有值或訂單姓名/手機
  })();
}, []);
```

- [ ] **Step 3: 存 profile**（仿 54–71 handleSave；PATCH）

```js
async function handleSaveProfile(e) {
  e.preventDefault(); setProfErr(""); setProfSaved(false);
  if (!prof.real_name.trim()) { setProfErr("請填真實姓名"); return; }
  if (!/^09\d{8}$/.test(prof.phone.trim())) { setProfErr("手機格式需為 09 開頭共 10 碼"); return; }
  if (!LEVELS.includes(prof.level)) { setProfErr("請選擇鋼琴程度"); return; }
  setProfSaving(true);
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch("/api/classroom/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify(prof),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) setProfErr("儲存失敗：" + (d.error || "unknown"));
    else setProfSaved(true);
  } finally { setProfSaving(false); }
}
```

- [ ] **Step 4: 區塊 JSX**（插在 142↔143，用 75–78 的 `input`/`label`/`btn` 樣式；程度/來源/器材/年齡/性別用 `<select>`）

```jsx
<div style={{ borderTop: "1px solid #eef2f7", marginTop: 22, paddingTop: 18 }}>
  <h3 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 12px" }}>我的學員資料</h3>
  <form onSubmit={handleSaveProfile} style={{ display: "grid", gap: 12 }}>
    <div><label style={label}>真實姓名 *</label>
      <input style={input} value={prof.real_name} onChange={e => setProf(p => ({ ...p, real_name: e.target.value }))} /></div>
    <div><label style={label}>手機 *</label>
      <input style={input} value={prof.phone} onChange={e => setProf(p => ({ ...p, phone: e.target.value }))} placeholder="09xxxxxxxx" /></div>
    <div><label style={label}>鋼琴程度 *</label>
      <select style={input} value={prof.level} onChange={e => setProf(p => ({ ...p, level: e.target.value }))}>
        <option value="">請選擇</option><option value="none">完全沒碰過</option>
        <option value="little">摸過一點</option><option value="some">有基礎</option></select></div>
    <div><label style={label}>學習目標（選填）</label>
      <input style={input} value={prof.goal} onChange={e => setProf(p => ({ ...p, goal: e.target.value }))} /></div>
    <div><label style={label}>怎麼認識 InRecord（選填）</label>
      <select style={input} value={prof.source} onChange={e => setProf(p => ({ ...p, source: e.target.value }))}>
        <option value="">請選擇</option><option value="ig">Instagram</option><option value="friend">朋友介紹</option>
        <option value="concert">演奏會</option><option value="search">網路搜尋</option><option value="other">其他</option></select></div>
    <div><label style={label}>練習器材（選填）</label>
      <select style={input} value={prof.equipment} onChange={e => setProf(p => ({ ...p, equipment: e.target.value }))}>
        <option value="">請選擇</option><option value="acoustic">鋼琴</option><option value="digital">電鋼琴</option><option value="none">目前沒有</option></select></div>
    <div><label style={label}>年齡層（選填）</label>
      <select style={input} value={prof.age_group} onChange={e => setProf(p => ({ ...p, age_group: e.target.value }))}>
        <option value="">請選擇</option><option value="under18">未滿 18</option><option value="18_29">18–29</option>
        <option value="30_44">30–44</option><option value="45_59">45–59</option><option value="60plus">60 以上</option></select></div>
    <div><label style={label}>性別（選填）</label>
      <select style={input} value={prof.gender} onChange={e => setProf(p => ({ ...p, gender: e.target.value }))}>
        <option value="">請選擇</option><option value="male">男</option><option value="female">女</option>
        <option value="other">其他</option><option value="prefer_not">不願透露</option></select></div>
    {profErr && <p style={{ color: "#dc2626", fontSize: 13, margin: 0 }}>{profErr}</p>}
    {profSaved && <p style={{ color: "#16a34a", fontSize: 13, margin: 0 }}>已儲存 ✓</p>}
    <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>
      填寫即表示同意依<a href="/privacy" style={{ color: "#2563eb" }}>隱私政策</a>將資料用於課程服務與聯繫。</p>
    <button type="submit" style={btn} disabled={profSaving}>{profSaving ? "儲存中…" : "儲存學員資料"}</button>
  </form>
</div>
```

- [ ] **Step 5: build 驗證** `cd ~/code/inrecord && npx next build 2>&1 | tail -20`

- [ ] **Step 6: Commit**

```bash
git -C ~/code/inrecord add app/classroom/account/page.jsx
git -C ~/code/inrecord commit -m "feat: 帳號頁『我的學員資料』區（8 欄讀寫＋告知聲明）"
```

---

### Task 5: 教室首次引導 gate

**Files:**
- Modify: `app/classroom/page.jsx`（加 profile state＋抓取；在 1151↔1153 之間插第三道 early-return）

**Interfaces:**
- Consumes: `isProfileCoreComplete`（Task 2）、`GET /api/classroom/profile`（Task 3）；引導表單 UI 沿用 Task 4 的欄位/樣式（核心必填、選配可跳）

- [ ] **Step 1: import＋state**

頂部 import 加 `import { isProfileCoreComplete } from "@/lib/student-profile";`。在 888 附近加：
```js
const [profile, setProfile] = useState(null);
const [profileLoaded, setProfileLoaded] = useState(false);
```

- [ ] **Step 2: 抓 profile**（新 effect，gate 在 `hasPurchased && token`，仿 957–979）

```js
useEffect(() => {
  if (!hasPurchased || !token) return;
  (async () => {
    const r = await fetch("/api/classroom/profile", { headers: { Authorization: `Bearer ${token}` } });
    const d = await r.json().catch(() => ({}));
    setProfile(d.profile || d.prefill || {});
    setProfileLoaded(true);
  })();
}, [hasPurchased, token]);
```

- [ ] **Step 3: 插入引導 gate**（在 1151 未購課 gate 的 `);` 與 1153 `const progMap` 之間）

```jsx
  // 首次引導：已購課但核心資料未填 → 先完善資料（選配可跳過）
  if (hasPurchased && profileLoaded && !isProfileCoreComplete(profile)) {
    return <ProfileOnboarding token={token} initial={profile} onDone={(p) => setProfile(p)} />;
  }
```

- [ ] **Step 4: `ProfileOnboarding` 子元件**（co-located，比照本檔既有子元件如 `NotesTab` 的 `function X(){…}` 模式；核心必填、選配可「先略過」；送出打 PATCH，欄位/select 直接抄 Task 4 Step 4 的 JSX）

```jsx
function ProfileOnboarding({ token, initial, onDone }) {
  const [f, setF] = useState({ real_name:"", phone:"", level:"", goal:"", source:"", equipment:"", age_group:"", gender:"", ...initial });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function save(skipOptional) {
    setErr("");
    if (!f.real_name.trim()) { setErr("請填真實姓名"); return; }
    if (!/^09\d{8}$/.test(f.phone.trim())) { setErr("手機格式需為 09 開頭共 10 碼"); return; }
    if (!["none","little","some"].includes(f.level)) { setErr("請選擇鋼琴程度"); return; }
    setBusy(true);
    try {
      const body = skipOptional ? { real_name: f.real_name, phone: f.phone, level: f.level } : f;
      const r = await fetch("/api/classroom/profile", { method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) { setErr("儲存失敗：" + (d.error || "unknown")); return; }
      onDone({ ...f, ...body });
    } finally { setBusy(false); }
  }
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const label = { display: "block", fontSize: 13, color: "#475569", marginBottom: 6, fontWeight: 500 };
  const input = { width: "100%", padding: "11px 14px", fontSize: 16, border: "1px solid #d5dce6", borderRadius: 10 };
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", display: "grid", placeItems: "center", padding: "40px 20px" }}>
      <div style={{ width: "min(480px,100%)", background: "#fff", borderRadius: 16, padding: 28, boxShadow: "0 2px 24px rgba(15,23,42,.07)" }}>
        <h2 style={{ margin: "0 0 6px", fontSize: 22 }}>完善你的學員資料</h2>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: "#64748b" }}>幾個問題，幫我們更了解你、安排適合的教學（核心必填，其餘可之後補）。</p>
        <div style={{ display: "grid", gap: 12 }}>
          <div><label style={label}>真實姓名 *</label><input style={input} value={f.real_name} onChange={e => set("real_name", e.target.value)} /></div>
          <div><label style={label}>手機 *</label><input style={input} value={f.phone} onChange={e => set("phone", e.target.value)} placeholder="09xxxxxxxx" /></div>
          <div><label style={label}>鋼琴程度 *</label>
            <select style={input} value={f.level} onChange={e => set("level", e.target.value)}>
              <option value="">請選擇</option><option value="none">完全沒碰過</option><option value="little">摸過一點</option><option value="some">有基礎</option></select></div>
          <div><label style={label}>學習目標（選填）</label><input style={input} value={f.goal} onChange={e => set("goal", e.target.value)} /></div>
          <div><label style={label}>怎麼認識 InRecord（選填）</label>
            <select style={input} value={f.source} onChange={e => set("source", e.target.value)}>
              <option value="">請選擇</option><option value="ig">Instagram</option><option value="friend">朋友介紹</option><option value="concert">演奏會</option><option value="search">網路搜尋</option><option value="other">其他</option></select></div>
          <div><label style={label}>練習器材（選填）</label>
            <select style={input} value={f.equipment} onChange={e => set("equipment", e.target.value)}>
              <option value="">請選擇</option><option value="acoustic">鋼琴</option><option value="digital">電鋼琴</option><option value="none">目前沒有</option></select></div>
          <div><label style={label}>年齡層（選填）</label>
            <select style={input} value={f.age_group} onChange={e => set("age_group", e.target.value)}>
              <option value="">請選擇</option><option value="under18">未滿 18</option><option value="18_29">18–29</option><option value="30_44">30–44</option><option value="45_59">45–59</option><option value="60plus">60 以上</option></select></div>
          <div><label style={label}>性別（選填）</label>
            <select style={input} value={f.gender} onChange={e => set("gender", e.target.value)}>
              <option value="">請選擇</option><option value="male">男</option><option value="female">女</option><option value="other">其他</option><option value="prefer_not">不願透露</option></select></div>
          {err && <p style={{ color: "#dc2626", fontSize: 13, margin: 0 }}>{err}</p>}
          <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>填寫即表示同意依<a href="/privacy" style={{ color: "#2563eb" }}>隱私政策</a>將資料用於課程服務與聯繫。</p>
          <button onClick={() => save(false)} disabled={busy} style={{ width: "100%", padding: 12, fontSize: 15, fontWeight: 600, color: "#fff", background: "#2563eb", border: 0, borderRadius: 10 }}>{busy ? "儲存中…" : "儲存並開始上課"}</button>
          <button onClick={() => save(true)} disabled={busy} style={{ width: "100%", padding: 10, fontSize: 13, color: "#64748b", background: "none", border: 0 }}>只填必填、其餘之後補</button>
        </div>
      </div>
    </div>
  );
}
```
> 註：`save(true)` 仍寫入核心 3 欄（核心必填不可跳）、僅略過選配；核心齊後 `isProfileCoreComplete` 為真、下次不再攔。

- [ ] **Step 5: build 驗證** `cd ~/code/inrecord && npx next build 2>&1 | tail -20`（確認 JSX 無誤、`ProfileOnboarding` 已定義）

- [ ] **Step 6: Commit**

```bash
git -C ~/code/inrecord add app/classroom/page.jsx
git -C ~/code/inrecord commit -m "feat: 教室首次引導 gate（核心未填先完善資料）"
```

---

### Task 6: 隱私政策條文＋告知聲明

**Files:**
- Modify: `app/privacy/page.jsx`（`DefaultPrivacyContent` 的 Section 2 `<ul>` 內加 `<li>`）

**Interfaces:** 無 code interface；純文案。

- [ ] **Step 1: 先確認後台是否已覆寫 privacy**

⚠️ `privacy` 頁優先讀 `site_content(key='privacy')` 的後台文案，**只有後台未編輯時才顯示程式內建 `DefaultPrivacyContent`**。先查：
```sql
SELECT key, (body_md IS NOT NULL) AS has_override FROM site_content WHERE key='privacy';
```
（用 Supabase MCP）。**若 `has_override` 為真** → 改程式碼不會顯示，需請使用者在後台「隱私權政策」編輯器同步加同一段文字（或本 task 改為更新後台文案）。若無覆寫 → 改 `DefaultPrivacyContent` 即生效。

- [ ] **Step 2: 在 Section 2 蒐集項目 `<ul>` 加一條**（`app/privacy/page.jsx` 的 Section 2，約 52–60 的 `<ul>` 內）

```jsx
<li><b>學員基本資料</b>：您在「學員資料」頁填寫的真實姓名、手機、鋼琴程度，以及選填的學習目標、認識管道、練習器材、年齡層、性別。用於課務聯繫、教學安排、帳號協助與去識別化之營運統計。</li>
```

- [ ] **Step 3: build 驗證** `cd ~/code/inrecord && npx next build 2>&1 | tail -20`

- [ ] **Step 4: Commit**

```bash
git -C ~/code/inrecord add app/privacy/page.jsx
git -C ~/code/inrecord commit -m "docs: 隱私政策補『學員基本資料』蒐集條文"
```

---

### Task 7: 後台單一學員檢視顯示 profile

**Files:**
- Modify: `app/api/admin/customer/route.js`（四源 Promise.all 加撈 profile、回傳多帶 `profile`）
- Modify: `app/admin/page.jsx`（`CustomerLookupPage` 加一個 profile panel，仿「存取權限」panel 約 2992–2998）

**Interfaces:**
- Consumes: `student_profiles`（Task 1）；`verifyAdminToken`（既有）

- [ ] **Step 1: customer API 加撈 profile**

`app/api/admin/customer/route.js`：在既有平行讀取（約 14–19）加一筆，並在回傳物件（約 21–28）多帶 `profile`：
```js
const { data: profile } = await supabase
  .from("student_profiles").select("*").ilike("email", email).maybeSingle();
// …回傳 { ok:true, email, orders, enrollments, subscriptions, emails, profile: profile || null }
```

- [ ] **Step 2: 前端 profile panel**（`CustomerLookupPage`，在「存取權限」panel 之後、約 2998 之後插入）

```jsx
{data.profile && (
  <div className={styles.panel}>
    <div className={styles.panelHead}><h3 style={{ margin: 0 }}>學員資料</h3></div>
    <div style={{ padding: "4px 14px 14px", fontSize: 13, color: "#374151", lineHeight: 1.9 }}>
      <div>姓名：{data.profile.real_name || "—"}　手機：{data.profile.phone || "—"}</div>
      <div>程度：{({none:"沒碰過",little:"摸過一點",some:"有基礎"})[data.profile.level] || "—"}</div>
      <div>目標：{data.profile.goal || "—"}</div>
      <div>來源：{data.profile.source || "—"}　器材：{data.profile.equipment || "—"}</div>
      <div>年齡層：{data.profile.age_group || "—"}　性別：{data.profile.gender || "—"}</div>
      <div>填寫時間：{data.profile.consent_at ? fmt(data.profile.consent_at) : "—"}</div>
    </div>
  </div>
)}
```
（`fmt` 為既有時間格式化函式，約 2862。）

- [ ] **Step 3: build 驗證** `cd ~/code/inrecord && npx next build 2>&1 | tail -20`

- [ ] **Step 4: Commit**

```bash
git -C ~/code/inrecord add app/api/admin/customer/route.js app/admin/page.jsx
git -C ~/code/inrecord commit -m "feat: 後台顧客查詢顯示學員資料"
```

---

### Task 8: 後台學員名單帶 profile＋篩選

**Files:**
- Modify: `app/api/admin/students/route.js`（多讀 `student_profiles`、併入每列）
- Modify: `lib/admin-students.js`（`mergeStudents` 併入 profile 欄位）＋ `lib/admin-students.test.js`
- Modify: `app/admin/page.jsx`（`StudentsPage` thead 885 加欄、tbody 888–907 加格、filter 861 加「已填資料」條件、detail 陣列 929–935 加列）

**Interfaces:**
- Consumes: `student_profiles`（Task 1）；`mergeStudents`（既有）

- [ ] **Step 1: `mergeStudents` 併 profile（TDD）**

在 `lib/admin-students.test.js` 加：
```js
it("併入 profile：有 profile 的 email 帶 hasProfile=true 與 level/phone", () => {
  const out = mergeStudents({ enrollments: [{ email: "a@x.com" }], orders: [], leads: [],
    profiles: [{ email: "a@x.com", real_name: "王", phone: "0912345678", level: "some" }] });
  const row = out.find(r => r.email === "a@x.com");
  expect(row.hasProfile).toBe(true);
  expect(row.profileName).toBe("王");
  expect(row.level).toBe("some");
});
it("無 profile → hasProfile=false", () => {
  const out = mergeStudents({ enrollments: [{ email: "b@x.com" }], orders: [], leads: [], profiles: [] });
  expect(out.find(r => r.email === "b@x.com").hasProfile).toBe(false);
});
```
Run 確認 FAIL → 在 `mergeStudents` 簽名加 `profiles = []` 參數，建 `Map(email→profile)`，每列輸出加 `hasProfile`/`profileName`/`level`（email 小寫比對）→ Run 確認 PASS。

- [ ] **Step 2: students API 多讀 profiles**

`app/api/admin/students/route.js` 的 `Promise.all`（約 16–20）加 `supabase.from("student_profiles").select("email, real_name, phone, level, source, age_group, gender")`；解構後傳給 `mergeStudents({ enrollments, orders, leads, profiles })`。

- [ ] **Step 3: 前端名單欄＋篩選**

`StudentsPage`：thead（885）加 `<th>程度</th><th>已填</th>`；tbody（888–907）對應加 `<td>{levelLabel(s.level)}</td><td>{s.hasProfile?"✓":"—"}</td>`（`levelLabel` 小 map）；篩選 `filtered`（861）加一個「只看未填資料」toggle（`showUnfilledOnly` state → `.filter(s => !showUnfilledOnly || !s.hasProfile)`）；detail 欄位陣列（929–935）加 `["程度", levelLabel]`、`["手機", s.phone]`、`["來源", s.source]` 等列。

- [ ] **Step 4: build＋測試** `npx vitest run lib/admin-students.test.js` PASS；`cd ~/code/inrecord && npx next build 2>&1 | tail -20`。

- [ ] **Step 5: Commit**

```bash
git -C ~/code/inrecord add app/api/admin/students/route.js lib/admin-students.js lib/admin-students.test.js app/admin/page.jsx
git -C ~/code/inrecord commit -m "feat: 後台學員名單帶學員資料＋未填篩選"
```

---

### Task 9: 部署＋端到端驗證

- [ ] **Step 1: 全測試綠** `npx vitest run lib/student-profile.test.js lib/admin-students.test.js` → 全 PASS。
- [ ] **Step 2: 確認正式 DB 已建表**（Task 1 Step 2 已跑）：`SELECT count(*) FROM student_profiles;`。
- [ ] **Step 3: 推送＋部署**：`git -C ~/code/inrecord push`（先 `gh auth switch --user inrecmusic`）→ `npx vercel --prod --yes --cwd ~/code/inrecord`。
- [ ] **Step 4: 端到端驗證**：① 未帶 token `GET /api/classroom/profile` → 401；② 用測試帳號登入教室、若核心未填應跳「完善資料」、填完進課程；③ 帳號頁「我的學員資料」可讀回並改；④ 後台顧客查詢 / 學員名單看得到該筆 profile。

---

## 第二階段（加值，另開 plan）

- **統計圖表**：新 `GET /api/admin/profile-stats`（後端 SQL `group by level/source/age_group/gender`）＋ 後台面板圖表（沿用廣告成效儀錶板既有圖表元件）。
- **CSV 匯出**：學員 profile CSV，用 `lib/serial-codes.js` 的 `esc`（公式注入防護）＋前端 `"﻿"` BOM 前綴（比照 `StudentsPage` 既有 `exportCsv`）。

## 風險
- **隱私覆寫**：privacy 若後台已覆寫，改程式無效（Task 6 Step 1 先查）。
- **首次引導摩擦**：核心必填在開課尖峰可能流失；選配可跳＋預填降低。
- **預填一致性**：登入 email ≠ 購買 email 時預填落空（留白自填、不阻擋）。
- **`full_name` vs `real_name`**：帳號頁「顯示名稱」（auth metadata）與「學員資料·真實姓名」（profiles）並存、用途不同；本 plan 不合併，UI 上分區呈現避免混淆。
