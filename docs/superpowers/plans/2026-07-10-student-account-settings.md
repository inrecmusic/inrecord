# 學員帳號設定 ＋ 忘記密碼流程 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓登入學員能在 `/classroom/account` 修改顯示名稱，並提供完整的忘記密碼→重設流程。

**Architecture:** 純前端，走既有 `@/lib/supabase` 前端 client 的 Supabase Auth SDK（`updateUser` / `resetPasswordForEmail`）。忘記密碼的重設信導回既有 `/auth/callback`（PKCE `exchangeCodeForSession`＋`next` 參數）建立復原 session，再轉址到新的重設密碼頁；該頁只要有 session 即可運作，故同時作為「登入後改密碼」頁。顯示名稱存於 `user_metadata.full_name`（留言／評分既有讀取欄位）。

**Tech Stack:** Next.js 14 App Router（client components）、Supabase Auth（`@supabase/supabase-js`）、Vitest（純函式測試，node 環境）。

## Global Constraints

- 前端 Supabase client 匯入：`import { supabase } from "@/lib/supabase"`（測試內用相對路徑 `./xxx.js`）。`supabase` 可能為 `null`（缺環境變數）→ 每個呼叫前先判斷，null 時顯示「系統設定錯誤，請聯繫管理員」。
- 純函式測試風格：`import { describe, it, expect } from "vitest";`，import 檔案帶 `.js` 副檔名，測試敘述用繁體中文（比照 `lib/inapp-browser.test.js`）。
- 回覆／文案一律繁體中文。
- 顯示名稱：去頭尾空白後長度 1–20 字；空字串／全空白為無效。
- 密碼下限 6 字（Supabase 預設）。
- 安全轉址沿用 `safeNextPath`（`lib/safe-redirect.js`，`export function safeNextPath(next, fallback = "/classroom")`）；重設信 `redirectTo` 用 `window.location.origin + "/auth/callback?next=/classroom/reset-password"`。
- 忘記密碼寄信：無論帳號是否存在都回相同成功訊息（防帳號枚舉）。
- 不新增後端 API 路由、無 DB migration。
- 部署慣例：push 前 `gh auth switch --user inrecmusic`；`npx vercel --prod`（Vercel 未接 GitHub 自動部署）。分支 `feat/point2-carousel`。
- commit message 結尾加：`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## File Structure

| 檔案 | 動作 | 職責 |
|---|---|---|
| `lib/account.js` | 建立 | `validateDisplayName(raw)` 純函式 |
| `lib/account.test.js` | 建立 | 上者的單元測試 |
| `app/classroom/reset-password/page.jsx` | 建立 | 設定新密碼頁（忘記密碼與登入後改密碼共用；session gate） |
| `app/classroom/account/page.jsx` | 建立 | 帳號設定頁（改顯示名稱、Email 唯讀、連往重設密碼） |
| `app/classroom/page.jsx` | 修改 | 頁首加「帳號」入口（連 `/classroom/account`） |
| `app/classroom/login/page.jsx` | 修改 | 密碼模式加「忘記密碼？」→ 寄重設信 |

---

### Task 1: 顯示名稱驗證純函式 `lib/account.js`

**Files:**
- Create: `lib/account.js`
- Test: `lib/account.test.js`

**Interfaces:**
- Produces: `validateDisplayName(raw: string) => { ok: true, value: string } | { ok: false, error: string }`。`value` 為去頭尾空白後的字串。

- [ ] **Step 1: 寫失敗測試**

Create `lib/account.test.js`:

```js
import { describe, it, expect } from "vitest";
import { validateDisplayName } from "./account.js";

describe("validateDisplayName", () => {
  it("正常名稱：去頭尾空白後回傳 ok", () => {
    expect(validateDisplayName("  小明  ")).toEqual({ ok: true, value: "小明" });
    expect(validateDisplayName("Rick Chang")).toEqual({ ok: true, value: "Rick Chang" });
  });

  it("剛好 20 字：通過", () => {
    const name = "一".repeat(20);
    expect(validateDisplayName(name)).toEqual({ ok: true, value: name });
  });

  it("空字串 / 純空白 / 非字串：回錯誤", () => {
    expect(validateDisplayName("")).toEqual({ ok: false, error: "請輸入顯示名稱" });
    expect(validateDisplayName("   ")).toEqual({ ok: false, error: "請輸入顯示名稱" });
    expect(validateDisplayName(undefined)).toEqual({ ok: false, error: "請輸入顯示名稱" });
    expect(validateDisplayName(null)).toEqual({ ok: false, error: "請輸入顯示名稱" });
  });

  it("超過 20 字（去空白後）：回錯誤", () => {
    expect(validateDisplayName("一".repeat(21))).toEqual({ ok: false, error: "顯示名稱請勿超過 20 字" });
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run lib/account.test.js`
Expected: FAIL（`validateDisplayName` is not a function / 找不到 `./account.js`）

- [ ] **Step 3: 寫最小實作**

Create `lib/account.js`:

```js
// lib/account.js — 帳號設定純函式（可測）。

export const DISPLAY_NAME_MAX = 20;

// 驗證顯示名稱：去頭尾空白 → 空白為無效 → 超過上限為無效。
export function validateDisplayName(raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return { ok: false, error: "請輸入顯示名稱" };
  if (value.length > DISPLAY_NAME_MAX) return { ok: false, error: `顯示名稱請勿超過 ${DISPLAY_NAME_MAX} 字` };
  return { ok: true, value };
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run lib/account.test.js`
Expected: PASS（4 tests）

- [ ] **Step 5: Commit**

```bash
git add lib/account.js lib/account.test.js
git commit -m "feat(account): 顯示名稱驗證純函式 validateDisplayName

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 重設密碼頁 `app/classroom/reset-password/page.jsx`

**Files:**
- Create: `app/classroom/reset-password/page.jsx`

**Interfaces:**
- Consumes: `supabase` from `@/lib/supabase`（`supabase.auth.getSession()`、`supabase.auth.updateUser({ password })`）。
- Produces: 路由 `/classroom/reset-password`。忘記密碼重設信經 `/auth/callback?next=/classroom/reset-password` 導到此頁；帳號設定頁也連此頁作「修改密碼」。

- [ ] **Step 1: 建立頁面**

Create `app/classroom/reset-password/page.jsx`:

```jsx
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Logo from "@/components/Logo";

const F = "'PingFang TC','Noto Sans TC',system-ui,-apple-system,sans-serif";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  // 進頁確認有 session（忘記密碼者經 /auth/callback 建立復原 session；
  // 登入中的使用者本來就有 session）。無 session → 顯示失效導引。
  useEffect(() => {
    if (!supabase) { setChecking(false); return; }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
      setChecking(false);
    });
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!supabase) { setError("系統設定錯誤，請聯繫管理員"); return; }
    if (pw.length < 6) { setError("密碼至少 6 個字"); return; }
    if (pw !== pw2) { setError("兩次輸入的密碼不一致"); return; }
    setSaving(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password: pw });
      if (err) throw err;
      setDone(true);
      setTimeout(() => router.replace("/classroom"), 1500);
    } catch (err) {
      setError(err.message || "設定失敗，請重試");
    } finally {
      setSaving(false);
    }
  }

  const wrap = { minHeight: "100vh", display: "grid", placeItems: "center", background: "#f1f5f9", padding: 24, fontFamily: F };
  const card = { width: "100%", maxWidth: 380, background: "#fff", borderRadius: 18, padding: "32px 28px", boxShadow: "0 10px 40px rgba(0,0,0,.08)" };
  const input = { width: "100%", padding: "11px 14px", fontSize: 16, border: "1px solid #d5dce6", borderRadius: 10, outline: "none", fontFamily: F, boxSizing: "border-box" };
  const label = { display: "block", fontSize: 13, color: "#475569", marginBottom: 6, fontWeight: 500 };
  const btn = { width: "100%", padding: "12px", fontSize: 15, fontWeight: 600, color: "#fff", background: "#2563eb", border: 0, borderRadius: 10, cursor: "pointer", fontFamily: F };

  if (checking) return (
    <div style={wrap}><p style={{ color: "#64748b", fontFamily: F }}>載入中…</p></div>
  );

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ marginBottom: 18 }}><Logo size={24} /></div>
        <h2 style={{ margin: "0 0 6px", fontSize: 22, color: "#0f172a" }}>設定新密碼</h2>

        {!hasSession ? (
          <>
            <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.7, margin: "8px 0 20px" }}>
              連結已失效或過期，請重新申請重設密碼。
            </p>
            <a href="/classroom/login" style={{ ...btn, display: "block", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>回登入頁</a>
          </>
        ) : done ? (
          <p style={{ color: "#16a34a", fontSize: 14, lineHeight: 1.7, margin: "12px 0" }}>
            密碼已更新，正在帶你回教室…
          </p>
        ) : (
          <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 14 }}>
              <label style={label} htmlFor="pw">新密碼</label>
              <input id="pw" type="password" style={input} value={pw}
                onChange={e => setPw(e.target.value)} placeholder="至少 6 個字"
                autoComplete="new-password" required />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={label} htmlFor="pw2">再次輸入新密碼</label>
              <input id="pw2" type="password" style={input} value={pw2}
                onChange={e => setPw2(e.target.value)} placeholder="再輸入一次"
                autoComplete="new-password" required />
            </div>
            {error && <p style={{ color: "#dc2626", fontSize: 13, margin: "0 0 12px" }}>{error}</p>}
            <button type="submit" style={btn} disabled={saving}>{saving ? "設定中…" : "更新密碼"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 手動驗證（本機 dev 或 preview）**

啟動：`npm run dev`，瀏覽器開 `http://localhost:3000/classroom/reset-password`
- 未登入直接開 → 顯示「連結已失效或過期，請重新申請」＋「回登入頁」。
- 已登入狀態開（先登入教室）→ 顯示「設定新密碼」表單；輸入 <6 字 → 「密碼至少 6 個字」；兩次不一致 → 「兩次輸入的密碼不一致」。
（完整「收信→點連結→設密碼」的 e2e 於 Task 4 之後、部署 preview 時一併驗。）

- [ ] **Step 3: Commit**

```bash
git add app/classroom/reset-password/page.jsx
git commit -m "feat(account): 重設密碼頁（忘記密碼與改密碼共用，session gate）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 帳號設定頁 `app/classroom/account/page.jsx` ＋ 教室頁首入口

**Files:**
- Create: `app/classroom/account/page.jsx`
- Modify: `app/classroom/page.jsx`（頁首加「帳號」連結）

**Interfaces:**
- Consumes: `validateDisplayName` from `@/lib/account`；`supabase` from `@/lib/supabase`（`getUser`、`updateUser({ data: { full_name } })`）；路由 `/classroom/reset-password`（Task 2）。
- Produces: 路由 `/classroom/account`。

- [ ] **Step 1: 建立帳號設定頁**

Create `app/classroom/account/page.jsx`:

```jsx
"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { validateDisplayName } from "@/lib/account";
import Logo from "@/components/Logo";

const F = "'PingFang TC','Noto Sans TC',system-ui,-apple-system,sans-serif";

export default function AccountPage() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function init() {
      if (!supabase) { setLoading(false); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/classroom/login"; return; }
      setEmail(user.email || "");
      setName(user.user_metadata?.full_name || "");
      setLoading(false);
    }
    init();
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setError(""); setSaved(false);
    if (!supabase) { setError("系統設定錯誤，請聯繫管理員"); return; }
    const check = validateDisplayName(name);
    if (!check.ok) { setError(check.error); return; }
    setSaving(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ data: { full_name: check.value } });
      if (err) throw err;
      setName(check.value);
      setSaved(true);
    } catch (err) {
      setError(err.message || "儲存失敗，請重試");
    } finally {
      setSaving(false);
    }
  }

  const wrap = { minHeight: "100vh", background: "#f1f5f9", padding: 24, fontFamily: F, display: "grid", placeItems: "center" };
  const card = { width: "100%", maxWidth: 420, background: "#fff", borderRadius: 18, padding: "30px 28px", boxShadow: "0 10px 40px rgba(0,0,0,.08)" };
  const input = { width: "100%", padding: "11px 14px", fontSize: 16, border: "1px solid #d5dce6", borderRadius: 10, outline: "none", fontFamily: F, boxSizing: "border-box" };
  const roInput = { ...input, background: "#f1f5f9", color: "#64748b" };
  const label = { display: "block", fontSize: 13, color: "#475569", marginBottom: 6, fontWeight: 500 };
  const btn = { width: "100%", padding: "12px", fontSize: 15, fontWeight: 600, color: "#fff", background: "#2563eb", border: 0, borderRadius: 10, cursor: "pointer", fontFamily: F };

  if (loading) return (<div style={wrap}><p style={{ color: "#64748b" }}>載入中…</p></div>);

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ marginBottom: 18 }}><Logo size={24} /></div>
        <h2 style={{ margin: "0 0 22px", fontSize: 22, color: "#0f172a" }}>帳號設定</h2>

        <form onSubmit={handleSave}>
          <div style={{ marginBottom: 16 }}>
            <label style={label}>Email（登入帳號，無法修改）</label>
            <input style={roInput} value={email} readOnly />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={label} htmlFor="name">顯示名稱</label>
            <input id="name" style={input} value={name}
              onChange={e => { setName(e.target.value); setSaved(false); }}
              placeholder="用於留言與評分掛名" maxLength={40} />
          </div>
          <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 18px", lineHeight: 1.6 }}>
            修改後僅影響日後的留言與評分掛名，先前發表的內容不會更動。
          </p>
          {error && <p style={{ color: "#dc2626", fontSize: 13, margin: "0 0 12px" }}>{error}</p>}
          {saved && <p style={{ color: "#16a34a", fontSize: 13, margin: "0 0 12px" }}>已儲存</p>}
          <button type="submit" style={btn} disabled={saving}>{saving ? "儲存中…" : "儲存"}</button>
        </form>

        <div style={{ borderTop: "1px solid #eef2f7", marginTop: 22, paddingTop: 18 }}>
          <a href="/classroom/reset-password" style={{ color: "#2563eb", fontSize: 14, textDecoration: "none" }}>修改密碼 →</a>
        </div>
        <div style={{ marginTop: 14 }}>
          <a href="/classroom" style={{ color: "#94a3b8", fontSize: 13, textDecoration: "none" }}>← 返回教室</a>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 教室頁首加「帳號」入口**

Modify `app/classroom/page.jsx`：在頁首的「登出」按鈕**之前**加一個「帳號」連結。找到（約在頁首 topbar，`<button onClick={handleLogout}` 那個登出鈕）並在其前面插入：

```jsx
          <a href="/classroom/account" style={{
            background: "none", border: "1px solid rgba(0,0,0,0.13)",
            color: "#334155", borderRadius: 980, padding: "5px 16px",
            cursor: "pointer", fontSize: 12, fontWeight: 500, fontFamily: F,
            textDecoration: "none",
          }}>
            帳號
          </a>
```

（`F` 已於該檔定義；沿用登出鈕相同外觀。）

- [ ] **Step 3: 手動驗證**

`npm run dev`，登入教室後：
- 頁首出現「帳號」→ 點擊進 `/classroom/account`。
- Email 唯讀灰底；改顯示名稱 → 空白送出 → 「請輸入顯示名稱」；21 字 → 「顯示名稱請勿超過 20 字」；正常名稱 → 「已儲存」。
- 重新整理 `/classroom/account` → 名字仍是新值。
- 「修改密碼 →」連到重設密碼頁（已登入 → 顯示設定新密碼表單）。

- [ ] **Step 4: Commit**

```bash
git add app/classroom/account/page.jsx app/classroom/page.jsx
git commit -m "feat(account): 帳號設定頁（改顯示名稱）＋教室頁首入口

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 登入頁「忘記密碼」寄重設信

**Files:**
- Modify: `app/classroom/login/page.jsx`

**Interfaces:**
- Consumes: `supabase.auth.resetPasswordForEmail(email, { redirectTo })`；既有 `/auth/callback`（`next=/classroom/reset-password`）。
- Produces: 登入頁密碼模式的「忘記密碼？」入口。

- [ ] **Step 1: 加 state 與處理函式**

Modify `app/classroom/login/page.jsx`：在既有 `const [otpSent, setOtpSent] = useState(false);` 之後加：

```jsx
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
```

在 `handleSubmit` 函式（`signInWithPassword`）之後加一個處理函式：

```jsx
  // 忘記密碼：寄重設信，導回 /auth/callback 建立復原 session 後轉重設密碼頁。
  // 無論帳號是否存在都回相同訊息，避免帳號枚舉。
  async function handleForgot() {
    setError("");
    if (!supabase) { setError("系統設定錯誤，請聯繫管理員"); return; }
    if (!email) { setError("請先輸入電子信箱"); return; }
    setResetLoading(true);
    try {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/auth/callback?next=/classroom/reset-password",
      });
      setResetSent(true);
    } catch {
      setResetSent(true); // 不透露錯誤/是否存在
    } finally {
      setResetLoading(false);
    }
  }
```

- [ ] **Step 2: 密碼表單加「忘記密碼？」入口**

在密碼模式的 `<form onSubmit={handleSubmit} ...>` 內，`{error && ...}` 與提交按鈕之間（或提交按鈕之後）加：

```jsx
            {resetSent ? (
              <p className={styles.helpText}>若此信箱有帳號，重設密碼信已寄出，請查收。</p>
            ) : (
              <button type="button" className={styles.linkBtn} onClick={handleForgot} disabled={resetLoading}>
                {resetLoading ? "寄送中…" : "忘記密碼？"}
              </button>
            )}
```

（`styles.helpText` 與 `styles.linkBtn` 皆為 `login.module.css` 既有 class。）

- [ ] **Step 3: 手動驗證（本機）**

`npm run dev` → `/classroom/login`（密碼模式）：
- 不填 Email 點「忘記密碼？」→ 「請先輸入電子信箱」。
- 填 Email 點「忘記密碼？」→ 變成「若此信箱有帳號，重設密碼信已寄出，請查收。」（本機未設 Supabase redirect 時仍會顯示此訊息，寄信實際到達於 preview/正式驗）。

- [ ] **Step 4: Commit**

```bash
git add app/classroom/login/page.jsx
git commit -m "feat(account): 登入頁加忘記密碼，寄重設信

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 全套測試 ＋ Supabase 後台設定 ＋ 部署 preview 端到端驗證

**Files:** 無（設定與驗證）

- [ ] **Step 1: 跑全套測試 ＋ build**

Run:
```bash
npx vitest run
npm run build
```
Expected: 全綠、build 成功（新增 `lib/account.test.js` 一併通過）。

- [ ] **Step 2: Supabase 後台設定（使用者操作，必要）**

- Auth → URL Configuration → Redirect URLs 加入：
  - `https://inrecordmusic.com/auth/callback`（若尚未涵蓋）
  - `https://inrecordmusic.com/classroom/reset-password`
  - （若要用 preview 測，另加該 preview 網域對應兩路徑）
- Auth → Email Templates →「Reset Password」模板確認啟用。

- [ ] **Step 3: 部署 preview 並端到端驗證**

```bash
gh auth switch --user inrecmusic
git push origin feat/point2-carousel
npx vercel   # preview
```
在 preview 網域驗（真機／瀏覽器）：
- 帳號頁：改名 → 存 → 重新整理仍在 → 教室發一則新留言，掛名為新名字、舊留言不變。
- 忘記密碼：登入頁點「忘記密碼？」→ 收到重設信 → 點連結 → 落在重設密碼頁 → 設新密碼 → 用新密碼登入成功。
- 重設頁無 session 直接開 → 顯示失效導引。

- [ ] **Step 4: 上正式站**

確認 preview 通過後：
```bash
npx vercel --prod
```
（正式站的 Supabase Redirect URLs 已於 Step 2 設定。）

---

## Self-Review

**Spec coverage：**
- 帳號設定頁改顯示名稱 → Task 3 ✅
- 顯示名稱存 `user_metadata.full_name`、驗證、舊留言不追改文案 → Task 1（驗證）＋ Task 3（寫入＋文案）✅
- Email 唯讀不可改 → Task 3 ✅
- 只需登入即可進帳號頁 → Task 3（`getUser` gate，不查購課）✅
- 忘記密碼：登入頁入口 → Task 4；沿用 `/auth/callback` → Task 4 的 `redirectTo`；重設頁 → Task 2 ✅
- 重設頁 session gate ＋ 兼作改密碼頁 → Task 2 ＋ Task 3 連結 ✅
- 防帳號枚舉 → Task 4 ✅
- Supabase Redirect URLs／Email 模板 → Task 5 Step 2 ✅
- 測試（純函式）＋ preview 真機驗 → Task 1、Task 5 ✅

**Placeholder scan：** 無 TBD/TODO；頁面程式碼完整；驗證步驟有具體操作與預期。

**Type consistency：** `validateDisplayName` 回傳 `{ ok, value/error }` 於 Task 1 定義、Task 3 使用一致；`redirectTo` 的 `next=/classroom/reset-password` 對應 Task 2 建立的路由；`updateUser({ data: { full_name } })` 寫入的欄位即留言/評分讀的 `user_metadata.full_name`。
