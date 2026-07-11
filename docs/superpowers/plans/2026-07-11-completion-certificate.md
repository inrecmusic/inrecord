# 完課證書 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 已購課且看完所有影片＋通過所有測驗的學員，在 `/classroom/certificate` 取得可列印的完課證書。

**Architecture:** 資格判定純函式 `lib/certificate.js`（吃 id 陣列、不碰 DB）＋ `/api/classroom/certificate`（service role 蒐集發布影片/已完成/發布測驗/已通過，後端算資格、合格則冪等發證）。新表 `certificates`（user_id 唯一、一人一張）。學員頁 `/classroom/certificate` 合格渲染 Apple 簡約可列印證書（`window.print()`），不合格顯示還差多少。

**Tech Stack:** Next.js 14 App Router（route handler＋client page）、Supabase（service role）、Node `crypto`（cert_code）、Vitest（node 純函式測試）。

## Global Constraints

- 學員端 API 驗證：inline `getUserClient(token)`→`.auth.getUser()`；購課驗證 `hasCourseAccess(getSupabaseAdmin(), user.email)`（`@/lib/course-access`）。
- 特權讀寫用 `getSupabaseAdmin()`（`@/lib/supabase`，null → 503 `db_not_configured`）。
- **資格後端權威、前端不可宣稱合格**：驗購課(403)＋所有 `videos.published=true` 皆 `progress.completed=true`（該 user）＋所有 `quizzes.published=true` 皆有 `quiz_attempts.passed=true`（該 user）。
- 邊界：`quizTotal===0` 時測驗條件自動滿足；**`videoTotal===0` → 不合格**（沒東西可完成）。
- 一人一張、冪等：`certificates` 對 `user_id` 唯一；發證用 insert 容忍 `23505`（已存在）後 select 既有 row，取穩定 `cert_code`/`issued_at`。
- 姓名＝`user.user_metadata?.full_name || user.email?.split("@")[0] || "學員"`；課名＝`從零開始學鋼琴`。
- cert_code＝`INREC-` ＋ 8 碼（CSPRNG，字母表排除易混字 `0O1IL`）。
- 表 RLS service_role-only。教室頁 inline style（無 CSS module），`F` 已定義。
- 全部 UI／錯誤文案繁體中文。
- 測試：純函式 `lib/*.test.js`（vitest node，繁中敘述，import 帶 `.js`）。路由／頁面以 `npm run build` 編譯驗證，功能性留最後 e2e。
- Stage 僅列出檔案（repo 有無關 untracked docs，**勿** `git add -A`）。commit 結尾 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。分支 `feat/point2-carousel`。

## File Structure

| 檔案 | 動作 | 職責 |
|---|---|---|
| `lib/certificate.js` | 建立 | `certificateStatus(...)` 純函式 |
| `lib/certificate.test.js` | 建立 | 上者單元測試 |
| `supabase-classroom-features.sql` | 修改（append） | `certificates` 表＋RLS |
| `app/api/classroom/certificate/route.js` | 建立 | 資格判定＋冪等發證 |
| `app/classroom/certificate/page.jsx` | 建立 | 證書頁（合格列印／不合格進度） |
| `app/classroom/account/page.jsx` | 修改 | 加「完課證書 →」入口 |
| `middleware.js` | 修改 | `CLASSROOM_LOCK_EXEMPT` 加 `/classroom/certificate` |

---

### Task 1: 資格判定純函式 `lib/certificate.js`

**Files:**
- Create: `lib/certificate.js`
- Test: `lib/certificate.test.js`

**Interfaces:**
- Produces: `certificateStatus({ publishedVideoIds, completedVideoIds, publishedQuizIds, passedQuizIds }) => { eligible, videoDone, videoTotal, quizDone, quizTotal }`。`videoDone`＝published 影片中已完成數；`quizDone`＝published 測驗中已通過數；`eligible = videoTotal>0 && videoDone===videoTotal && quizDone===quizTotal`。

- [ ] **Step 1: 寫失敗測試**

Create `lib/certificate.test.js`:

```js
import { describe, it, expect } from "vitest";
import { certificateStatus } from "./certificate.js";

describe("certificateStatus", () => {
  it("影片全完成＋測驗全通過 → 合格", () => {
    expect(certificateStatus({
      publishedVideoIds: ["v1", "v2"], completedVideoIds: ["v1", "v2", "vx"],
      publishedQuizIds: ["q1"], passedQuizIds: ["q1"],
    })).toEqual({ eligible: true, videoDone: 2, videoTotal: 2, quizDone: 1, quizTotal: 1 });
  });

  it("缺一支影片 → 不合格，數字正確", () => {
    expect(certificateStatus({
      publishedVideoIds: ["v1", "v2"], completedVideoIds: ["v1"],
      publishedQuizIds: [], passedQuizIds: [],
    })).toEqual({ eligible: false, videoDone: 1, videoTotal: 2, quizDone: 0, quizTotal: 0 });
  });

  it("缺一份測驗 → 不合格", () => {
    expect(certificateStatus({
      publishedVideoIds: ["v1"], completedVideoIds: ["v1"],
      publishedQuizIds: ["q1", "q2"], passedQuizIds: ["q1"],
    })).toEqual({ eligible: false, videoDone: 1, videoTotal: 1, quizDone: 1, quizTotal: 2 });
  });

  it("無任何 published 測驗 → 測驗條件自動滿足", () => {
    expect(certificateStatus({
      publishedVideoIds: ["v1"], completedVideoIds: ["v1"],
      publishedQuizIds: [], passedQuizIds: [],
    })).toEqual({ eligible: true, videoDone: 1, videoTotal: 1, quizDone: 0, quizTotal: 0 });
  });

  it("無任何 published 影片 → 不合格（沒東西可完成）", () => {
    expect(certificateStatus({
      publishedVideoIds: [], completedVideoIds: [],
      publishedQuizIds: [], passedQuizIds: [],
    })).toEqual({ eligible: false, videoDone: 0, videoTotal: 0, quizDone: 0, quizTotal: 0 });
  });

  it("nullish 輸入 → 全 0、不合格", () => {
    expect(certificateStatus({})).toEqual({ eligible: false, videoDone: 0, videoTotal: 0, quizDone: 0, quizTotal: 0 });
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run lib/certificate.test.js`
Expected: FAIL（找不到 `./certificate.js`）

- [ ] **Step 3: 實作**

Create `lib/certificate.js`:

```js
// lib/certificate.js — 完課證書資格判定純邏輯（吃 id 陣列，不碰 DB）。

export function certificateStatus({ publishedVideoIds, completedVideoIds, publishedQuizIds, passedQuizIds } = {}) {
  const pv = Array.isArray(publishedVideoIds) ? publishedVideoIds : [];
  const cv = new Set(Array.isArray(completedVideoIds) ? completedVideoIds : []);
  const pq = Array.isArray(publishedQuizIds) ? publishedQuizIds : [];
  const pass = new Set(Array.isArray(passedQuizIds) ? passedQuizIds : []);

  const videoTotal = pv.length;
  const videoDone = pv.filter((id) => cv.has(id)).length;
  const quizTotal = pq.length;
  const quizDone = pq.filter((id) => pass.has(id)).length;

  const eligible = videoTotal > 0 && videoDone === videoTotal && quizDone === quizTotal;
  return { eligible, videoDone, videoTotal, quizDone, quizTotal };
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run lib/certificate.test.js`
Expected: PASS（6 tests）

- [ ] **Step 5: Commit**

```bash
git add lib/certificate.js lib/certificate.test.js
git commit -m "feat(cert): 完課證書資格判定純函式 certificateStatus

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: SQL（append）＋ API `/api/classroom/certificate`

**Files:**
- Modify: `supabase-classroom-features.sql`（append certificates 段）
- Create: `app/api/classroom/certificate/route.js`

**Interfaces:**
- Consumes: `getSupabaseAdmin`, `hasCourseAccess`, `certificateStatus`（Task 1）, node `crypto`。
- Produces: `certificates` 表；`GET /api/classroom/certificate` → 合格 `{ eligible:true, name, courseTitle, issuedAt, certCode }`；不合格 `{ eligible:false, videoDone, videoTotal, quizDone, quizTotal }`。

- [ ] **Step 1: append SQL**

在 `supabase-classroom-features.sql` 檔尾 append：

```sql

-- ───────────────────────────────────────────
-- ③ 完課證書
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS certificates (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email     TEXT,
  cert_code TEXT NOT NULL UNIQUE,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS certificates_user_uniq ON certificates (user_id);

ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_certificates" ON certificates;
CREATE POLICY "service_role_certificates" ON certificates
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
```

- [ ] **Step 2: 建立路由**

Create `app/api/classroom/certificate/route.js`:

```js
import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { hasCourseAccess } from "@/lib/course-access";
import { certificateStatus } from "@/lib/certificate";

const COURSE_TITLE = "從零開始學鋼琴";
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 排除易混字 0O1IL

function makeCertCode() {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `INREC-${s}`;
}

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

  const [pv, cv, pq, pa] = await Promise.all([
    supabase.from("videos").select("id").eq("published", true),
    supabase.from("progress").select("video_id").eq("user_id", user.id).eq("completed", true),
    supabase.from("quizzes").select("id").eq("published", true),
    supabase.from("quiz_attempts").select("quiz_id").eq("user_id", user.id).eq("passed", true),
  ]);

  const status = certificateStatus({
    publishedVideoIds: (pv.data || []).map((r) => r.id),
    completedVideoIds: (cv.data || []).map((r) => r.video_id),
    publishedQuizIds: (pq.data || []).map((r) => r.id),
    passedQuizIds: (pa.data || []).map((r) => r.quiz_id),
  });

  if (!status.eligible) {
    return NextResponse.json({
      eligible: false,
      videoDone: status.videoDone, videoTotal: status.videoTotal,
      quizDone: status.quizDone, quizTotal: status.quizTotal,
    });
  }

  // 冪等發證：insert 容忍 23505（已有一張）→ 再 select 既有 row 取穩定 cert_code/issued_at。
  const { error: insErr } = await supabase
    .from("certificates")
    .insert({ user_id: user.id, email: user.email, cert_code: makeCertCode() });
  if (insErr && insErr.code !== "23505") {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }
  const { data: cert } = await supabase
    .from("certificates")
    .select("cert_code, issued_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const name = user.user_metadata?.full_name || user.email?.split("@")[0] || "學員";
  return NextResponse.json({
    eligible: true,
    name,
    courseTitle: COURSE_TITLE,
    issuedAt: cert?.issued_at || null,
    certCode: cert?.cert_code || null,
  });
}
```

- [ ] **Step 3: 編譯驗證**

Run: `npm run build`
Expected: 編譯成功，`/api/classroom/certificate` 在路由清單，無錯誤指向本檔。

- [ ] **Step 4: Commit**

```bash
git add supabase-classroom-features.sql app/api/classroom/certificate/route.js
git commit -m "feat(cert): certificates 表 SQL + 資格判定/冪等發證 API

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 證書頁 ＋ 帳號頁入口 ＋ middleware 放行

**Files:**
- Create: `app/classroom/certificate/page.jsx`
- Modify: `app/classroom/account/page.jsx`（加入口連結）
- Modify: `middleware.js`（放行）

**Interfaces:**
- Consumes: `GET /api/classroom/certificate`（Task 2）；`supabase` from `@/lib/supabase`。

- [ ] **Step 1: 建立證書頁**

Create `app/classroom/certificate/page.jsx`:

```jsx
"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Logo from "@/components/Logo";

const F = "'PingFang TC','Noto Sans TC',system-ui,-apple-system,sans-serif";

export default function CertificatePage() {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    if (!supabase) { setState({ loading: false, error: "config" }); return; }
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/classroom/login"; return; }
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      try {
        const r = await fetch("/api/classroom/certificate", { headers: { Authorization: `Bearer ${token}` } });
        if (r.status === 403) { if (!cancelled) setState({ loading: false, forbidden: true }); return; }
        const d = await r.json();
        if (!cancelled) setState({ loading: false, ...d });
      } catch {
        if (!cancelled) setState({ loading: false, error: "fetch" });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const wrap = { minHeight: "100vh", background: "#f1f5f9", padding: 24, fontFamily: F, display: "grid", placeItems: "center" };

  if (state.loading) return (<div style={wrap}><p style={{ color: "#64748b" }}>載入中…</p></div>);

  if (state.error === "config") return (<div style={wrap}><p style={{ color: "#dc2626", fontSize: 14 }}>系統設定錯誤，請聯繫管理員</p></div>);

  if (state.forbidden) return (
    <div style={wrap}>
      <div style={{ maxWidth: 420, background: "#fff", borderRadius: 18, padding: "30px 28px", textAlign: "center", boxShadow: "0 10px 40px rgba(0,0,0,.08)" }}>
        <div style={{ marginBottom: 14, display: "flex", justifyContent: "center" }}><Logo size={24} /></div>
        <p style={{ color: "#475569", fontSize: 14, lineHeight: 1.7 }}>購課並完成課程後即可取得完課證書。</p>
        <a href="/classroom" style={{ display: "inline-block", marginTop: 16, color: "#2563eb", fontSize: 14, textDecoration: "none" }}>← 返回教室</a>
      </div>
    </div>
  );

  if (!state.eligible) return (
    <div style={wrap}>
      <div style={{ maxWidth: 420, width: "100%", background: "#fff", borderRadius: 18, padding: "30px 28px", boxShadow: "0 10px 40px rgba(0,0,0,.08)" }}>
        <div style={{ marginBottom: 14 }}><Logo size={24} /></div>
        <h2 style={{ margin: "0 0 8px", fontSize: 20, color: "#0f172a" }}>尚未完成課程</h2>
        <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.8, margin: "0 0 16px" }}>完成以下項目即可領取完課證書：</p>
        <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#334155" }}>課程單元</span>
            <span style={{ color: state.videoDone === state.videoTotal && state.videoTotal > 0 ? "#16a34a" : "#b45309", fontWeight: 600 }}>已看完 {state.videoDone}/{state.videoTotal}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#334155" }}>章節測驗</span>
            <span style={{ color: state.quizDone === state.quizTotal ? "#16a34a" : "#b45309", fontWeight: 600 }}>已通過 {state.quizDone}/{state.quizTotal}</span>
          </div>
        </div>
        <a href="/classroom" style={{ display: "inline-block", marginTop: 20, color: "#2563eb", fontSize: 14, textDecoration: "none" }}>← 繼續上課</a>
      </div>
    </div>
  );

  const issued = state.issuedAt ? new Date(state.issuedAt).toLocaleDateString("zh-TW") : "";

  return (
    <div style={{ ...wrap, display: "block", padding: 0 }}>
      <style>{`
        @media print {
          .cert-noprint { display: none !important; }
          .cert-page { background: #fff !important; padding: 0 !important; }
          .cert-card { box-shadow: none !important; border: none !important; margin: 0 auto !important; }
        }
      `}</style>
      <div className="cert-page" style={{ minHeight: "100vh", background: "#f1f5f9", padding: 24, display: "grid", placeItems: "center", fontFamily: F }}>
        <div>
          <div className="cert-card" style={{
            width: "100%", maxWidth: 640, background: "#fff", borderRadius: 8,
            border: "1px solid #e5e7eb", boxShadow: "0 10px 50px rgba(0,0,0,.10)",
            padding: "56px 56px 48px", textAlign: "center", position: "relative",
          }}>
            <div style={{ position: "absolute", inset: 10, border: "1px solid #dbe3ef", borderRadius: 4, pointerEvents: "none" }} />
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}><Logo size={30} /></div>
            <div style={{ fontSize: 12, letterSpacing: ".28em", color: "#2563eb", fontWeight: 600, textTransform: "uppercase", marginBottom: 22 }}>Certificate of Completion</div>
            <div style={{ fontSize: 14, color: "#64748b", marginBottom: 6 }}>茲證明</div>
            <div style={{ fontSize: 30, fontWeight: 700, color: "#0f172a", letterSpacing: ".02em", marginBottom: 14 }}>{state.name}</div>
            <div style={{ fontSize: 15, color: "#475569", lineHeight: 1.9 }}>已完成線上課程</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: "#0f172a", margin: "6px 0 26px" }}>《{state.courseTitle}》</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 30, paddingTop: 18, borderTop: "1px solid #eef2f7" }}>
              <div style={{ textAlign: "left", fontSize: 12, color: "#94a3b8" }}>
                發證日期<br /><span style={{ color: "#334155", fontSize: 13 }}>{issued}</span>
              </div>
              <div style={{ textAlign: "right", fontSize: 12, color: "#94a3b8" }}>
                驗證碼<br /><span style={{ color: "#334155", fontSize: 13, fontFamily: "ui-monospace,monospace" }}>{state.certCode}</span>
              </div>
            </div>
          </div>
          <div className="cert-noprint" style={{ textAlign: "center", marginTop: 20 }}>
            <button onClick={() => window.print()} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 10, padding: "11px 26px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: F }}>列印／存成 PDF</button>
            <div style={{ marginTop: 14 }}><a href="/classroom" style={{ color: "#94a3b8", fontSize: 13, textDecoration: "none" }}>← 返回教室</a></div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 帳號頁加入口**

Modify `app/classroom/account/page.jsx`：在既有「修改密碼 →」連結那個 `<div style={{ borderTop... }}>`（含 `href="/classroom/reset-password"`）內，於該連結後面加一個證書連結。找到：
```jsx
          <a href="/classroom/reset-password" style={{ color: "#2563eb", fontSize: 14, textDecoration: "none" }}>修改密碼 →</a>
```
改為（同一個 div 內，兩個連結並列，中間換行）：
```jsx
          <a href="/classroom/reset-password" style={{ color: "#2563eb", fontSize: 14, textDecoration: "none", display: "block" }}>修改密碼 →</a>
          <a href="/classroom/certificate" style={{ color: "#2563eb", fontSize: 14, textDecoration: "none", display: "block", marginTop: 12 }}>完課證書 →</a>
```

- [ ] **Step 3: middleware 放行**

Modify `middleware.js`：把 `/classroom/certificate` 加進 `CLASSROOM_LOCK_EXEMPT`：
```js
    const CLASSROOM_LOCK_EXEMPT = ["/classroom/login", "/classroom/reset-password", "/classroom/account", "/classroom/certificate"];
```

- [ ] **Step 4: 編譯驗證**

Run: `npm run build`
Expected: 編譯成功，`/classroom/certificate` 在路由清單，無錯誤指向三檔。

- [ ] **Step 5: Commit**

```bash
git add app/classroom/certificate/page.jsx app/classroom/account/page.jsx middleware.js
git commit -m "feat(cert): 證書頁（可列印）＋帳號頁入口＋預售放行

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 部署套用（SQL）＋ 端到端驗證

**Files:** 無（部署與驗證，由 controller 執行）

- [ ] **Step 1: 全套測試 ＋ build**

Run:
```bash
npx vitest run
npm run build
```
Expected: 全綠；build 成功（新增 `/api/classroom/certificate` 與 `/classroom/certificate`）。

- [ ] **Step 2: 套用 SQL（controller via Supabase MCP）**

- 對正式專案（`vmslzbcegfljlopkewpx`）套用 `certificates` 段（建表＋user_id 唯一索引＋RLS＋policy）。
- 查詢確認 `certificates` 已建、RLS 已開、只有 `service_role_certificates` policy。

- [ ] **Step 3: 部署正式站**

```bash
gh auth switch --user inrecmusic
git push origin feat/point2-carousel
npx vercel --prod
```

- [ ] **Step 4: 端到端驗證**

- 未登入 `GET /api/classroom/certificate` → 401。
- middleware：正式站 `curl -o /dev/null -w %{http_code}` 打 `/classroom/certificate` → 200（不被鎖站導回首頁；比照 account）。
- 已購課但未完成的帳號 → `eligible:false`，頁面顯示「已看完 X/Y、已通過 A/B」數字與正式站資料相符。
- （若有已完成的測試帳號，或由 controller 用 Supabase 暫時把某測試帳號的 progress/attempts 補齊再還原）→ 頁面出現證書、`window.print()` 版面正常、`certificates` 表出現該 user 一列、重整/重打不換發（cert_code 不變）。

---

## Self-Review

**Spec coverage（對照 spec）：**
- 資格＝購課＋所有影片完成＋所有測驗通過，後端權威 → Task 1（純函式）＋Task 2（route 蒐集資料）✅
- 邊界（無測驗自動滿足、無影片不合格）→ Task 1 測試涵蓋 ✅
- `certificates` 表、一人一張、冪等（23505 容忍）→ Task 2 ✅
- cert_code CSPRNG 排除易混字 → Task 2 `makeCertCode` ✅
- 證書頁列印／不合格顯示差多少／forbidden 文案 → Task 3 ✅
- 帳號頁入口、middleware 放行 → Task 3 ✅
- 純函式測試 → Task 1；部署/e2e → Task 4 ✅

**Placeholder scan：** 無 TBD/TODO；路由與頁面程式碼完整；插入點以「找到 X 改為 Y」明確標示。

**Type consistency：** `certificateStatus` 回 `{ eligible, videoDone, videoTotal, quizDone, quizTotal }`（Task 1 定義、Task 2 route 消費、Task 3 不合格頁消費一致）；route 合格回 `{ eligible, name, courseTitle, issuedAt, certCode }`（Task 2 定義、Task 3 證書頁消費一致）；`certificates` 欄位（user_id/email/cert_code/issued_at）跨 SQL 與 route 一致；路徑 `/api/classroom/certificate`、`/classroom/certificate` 各處一致。
