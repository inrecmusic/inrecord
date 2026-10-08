# 首頁課程評價跑馬燈 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 首頁 hero 正下方顯示一條連續循環的學員評價跑馬燈（只放後台勾「首頁精選」的真實評價），並在教室儀表板加「看完第 1 章後給評分」的推力卡片。

**Architecture:** 資料層一個純函式模組 `lib/featured-reviews.js`（查詢＋轉卡片＋門檻＋補圈）由 `app/page.jsx` 伺服端呼叫、隨 ISR 60s 快取，透過 `reviews` prop 進 `HomeClient` 再交給純展示元件 `components/ReviewMarquee.jsx`（CSS keyframes 跑馬燈，hover/active 暫停、reduced-motion 退成可滑清單）。後台沿用既有 `PATCH /api/admin/ratings` 白名單加 `featured`。推力卡片 `components/classroom/RatingNudge.jsx` 由純函式 `lib/rating-nudge.js` 決定顯示，表單從 `RatingTab` 抽成 `RatingForm` 共用，`bootstrap` 多回 `rated`。

**Tech Stack:** Next.js 14 App Router、React 18、Supabase（service role）、Vitest 4（lib 純函式 node 環境；元件測試檔頂加 `// @vitest-environment jsdom`）、@testing-library/react、CSS Modules。

**Spec:** `docs/superpowers/specs/2026-10-08-homepage-reviews-marquee-design.md`

## Global Constraints

- 只用真實評價：資料來源只有 `ratings` 表 `featured = true AND hidden = false`，排除 `user_email` 等於 `ADMIN_EMAIL`（大小寫不敏感），**不輸出 email**。
- 無文字的評價卡片**留空白**（不補「給了 N 顆星」之類的字）。
- 區塊標題固定「課程評價」；文字上限 120 字，超過截斷加「…」；暱稱空白顯示「學員」；日期台灣時區 `YYYY/MM/DD`。
- 精選未滿 3 則整個區塊不渲染；不足 8 張重複一輪補滿。
- 跑馬燈背景 `#05070b`（與 `.hero` 同色）；hover／active 暫停；`prefers-reduced-motion: reduce` 關動畫、改橫向可滑。
- 首頁查詢失敗 fail-open（回 `[]`，首頁照常）。
- 所有 commit 訊息結尾加 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`；回覆使用繁體中文。
- 不要 `cd` 出工作樹 `/Users/zhoubolong/code/inrecord/.claude/worktrees/recent-activities-recall-e8b2c5`；測試指令 `npx vitest run <path>`。

## Review Focus

1. `content` 只有空白或換行的評價 → 視為無文字（卡片留空白），不能顯示一行空白符號或「…」。→ Task 2 測試。
2. `user_name` 含前後空白或只有空白 → 去空白後為空就顯示「學員」；不能顯示空字串。→ Task 2 測試。
3. `ratings.featured` 欄位還沒在 DB 建好（SQL 沒跑）→ 查詢報錯時首頁仍要正常渲染、不顯示跑馬燈。→ Task 2 測試（`getFeaturedReviews` 回 `[]`）。
4. 學員已評分但 `bootstrap` 查 `rated` 失敗 → 不能一直彈推力卡（會撞 `already_rated`）；查詢失敗視為 `rated: true`（fail-safe 不打擾）。→ Task 7 測試。
5. 第 1 章只有試看單元、或第 1 章沒有任何正課單元 → 不能把「0 支正課全部看完」當成完成而彈卡。→ Task 8 測試。

---

### Task 1: DB 欄位 `ratings.featured` ＋ 部署順序

**Files:**
- Create: `supabase-ratings-featured.sql`
- Modify: `docs/preview-db/build-schema.sh:11-31`（`ORDER` 陣列）
- Modify: `CLAUDE.md`（「部署需執行的 SQL」那段）

**Interfaces:**
- Produces: 欄位 `ratings.featured BOOLEAN NOT NULL DEFAULT FALSE`（Task 2、3 依賴）。

- [ ] **Step 1: 建 SQL 檔**

```sql
-- 首頁課程評價跑馬燈：「首頁精選」旗標（後台勾選才會出現在首頁）。
-- idempotent，可重複執行；既有評價預設 false，首頁行為不變。
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE;
```

- [ ] **Step 2: 加進 preview 合併腳本**

在 `docs/preview-db/build-schema.sh` 的 `ORDER=(` 陣列中，`supabase-progress-lock.sql` 之後、`supabase-hardening.sql` 之前插入一行：

```
  supabase-ratings-featured.sql
```

- [ ] **Step 3: 更新 CLAUDE.md 部署順序**

在 CLAUDE.md「部署需執行的 SQL」段落，`**supabase-scores.sql**（…）` 之後、`**`supabase-hardening.sql`（必跑，最後一步）**` 之前插入：

```
→ **supabase-ratings-featured.sql**（首頁評價跑馬燈：`ratings.featured` 旗標，idempotent；未跑時首頁不顯示跑馬燈、後台「首頁精選」開關會報錯）
```

- [ ] **Step 4: 對正式庫與 preview 庫執行 SQL**

用 Supabase MCP `apply_migration`（project `vmslzbcegfljlopkewpx`，name `add_ratings_featured`）執行 Step 1 的 SQL；preview 庫由使用者自行貼。執行後以 `select column_name from information_schema.columns where table_name='ratings' and column_name='featured'` 確認有一列。

- [ ] **Step 5: Commit**

```bash
git add supabase-ratings-featured.sql docs/preview-db/build-schema.sh CLAUDE.md
git commit -m "feat(db): ratings.featured 首頁精選旗標

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `lib/featured-reviews.js` 純函式＋查詢

**Files:**
- Create: `lib/featured-reviews.js`
- Test: `lib/featured-reviews.test.js`

**Interfaces:**
- Produces:
  - `toReviewCards(rows) → Array<{ id: string, score: number, text: string|null, name: string, date: string }>`
  - `shouldShowMarquee(cards) → boolean`（`cards.length >= 3`）
  - `fillLoop(cards, min = 8) → Array`（整輪重複直到 ≥ min；空陣列回 `[]`）
  - `getFeaturedReviews(db, { adminEmail = process.env.ADMIN_EMAIL, limit = 12 } = {}) → Promise<Array<card>>`（失敗回 `[]`）
  - 常數 `REVIEW_TEXT_MAX = 120`、`MARQUEE_MIN_CARDS = 3`、`LOOP_MIN = 8`

- [ ] **Step 1: 寫失敗測試**

```js
// lib/featured-reviews.test.js
import { describe, it, expect, vi, afterEach } from "vitest";
import { toReviewCards, shouldShowMarquee, fillLoop, getFeaturedReviews, REVIEW_TEXT_MAX } from "./featured-reviews";
import { makeSupabaseMock } from "./test-helpers/supabase-mock";

afterEach(() => vi.unstubAllEnvs());

describe("toReviewCards", () => {
  it("轉成卡片：文字去空白、暱稱、台灣日期；不含 email", () => {
    const [c] = toReviewCards([{ id: "r1", score: 5, content: "  很有幫助！ ", user_name: " sam ", user_email: "a@b.com", created_at: "2026-10-05T15:30:00Z" }]);
    expect(c).toEqual({ id: "r1", score: 5, text: "很有幫助！", name: "sam", date: "2026/10/05" });
    expect(JSON.stringify(c)).not.toContain("a@b.com");
  });
  it("UTC 晚上跨日：台灣日期要是隔天", () => {
    const [c] = toReviewCards([{ id: "r1", score: 5, content: "x", user_name: "a", created_at: "2026-10-05T17:00:00Z" }]);
    expect(c.date).toBe("2026/10/06");
  });
  it("空白／換行的文字 → null；暱稱空白 → 學員", () => {
    const [c] = toReviewCards([{ id: "r1", score: 4, content: " \n ", user_name: "   ", created_at: "2026-10-05T00:00:00Z" }]);
    expect(c.text).toBeNull();
    expect(c.name).toBe("學員");
  });
  it("content／user_name 為 null 也不會炸", () => {
    const [c] = toReviewCards([{ id: "r1", score: 5, content: null, user_name: null, created_at: "2026-10-05T00:00:00Z" }]);
    expect(c).toMatchObject({ text: null, name: "學員" });
  });
  it("超過 120 字截斷加「…」；剛好 120 字不截", () => {
    const long = "あ".repeat(REVIEW_TEXT_MAX + 1);
    const exact = "あ".repeat(REVIEW_TEXT_MAX);
    const [a, b] = toReviewCards([
      { id: "1", score: 5, content: long, user_name: "a", created_at: "2026-10-05T00:00:00Z" },
      { id: "2", score: 5, content: exact, user_name: "a", created_at: "2026-10-05T00:00:00Z" },
    ]);
    expect(a.text).toBe("あ".repeat(REVIEW_TEXT_MAX) + "…");
    expect(b.text).toBe(exact);
  });
  it("score 轉數字；非數字落 0", () => {
    const [c] = toReviewCards([{ id: "1", score: "5", content: "x", user_name: "a", created_at: "2026-10-05T00:00:00Z" }]);
    expect(c.score).toBe(5);
  });
});

describe("shouldShowMarquee", () => {
  it("2 則不顯示、3 則顯示", () => {
    const card = (i) => ({ id: String(i), score: 5, text: null, name: "學員", date: "2026/10/05" });
    expect(shouldShowMarquee([card(1), card(2)])).toBe(false);
    expect(shouldShowMarquee([card(1), card(2), card(3)])).toBe(true);
  });
});

describe("fillLoop", () => {
  const cards = [1, 2, 3, 4].map((i) => ({ id: String(i) }));
  it("4 張補成 8 張、順序循環", () => {
    expect(fillLoop(cards).map((c) => c.id)).toEqual(["1", "2", "3", "4", "1", "2", "3", "4"]);
  });
  it("5 張補成 10 張（整輪重複，不切半）", () => {
    const five = [...cards, { id: "5" }];
    expect(fillLoop(five)).toHaveLength(10);
  });
  it("已滿 8 張不補；0 張回空", () => {
    const eight = Array.from({ length: 8 }, (_, i) => ({ id: String(i) }));
    expect(fillLoop(eight)).toHaveLength(8);
    expect(fillLoop([])).toEqual([]);
  });
});

describe("getFeaturedReviews", () => {
  const row = (over = {}) => ({ id: "r1", score: 5, content: "好", user_name: "sam", user_email: "s@x.com", created_at: "2026-10-05T00:00:00Z", ...over });
  it("查 featured=true、hidden=false、created_at desc、limit；回卡片", async () => {
    const sb = makeSupabaseMock(() => ({ data: [row()], error: null }));
    const cards = await getFeaturedReviews(sb, { adminEmail: "admin@x.com", limit: 5 });
    expect(cards).toEqual([{ id: "r1", score: 5, text: "好", name: "sam", date: "2026/10/05" }]);
    const q = sb.calls[0];
    expect(q.table).toBe("ratings");
    expect(q.ops).toContainEqual({ m: "eq", args: ["featured", true] });
    expect(q.ops).toContainEqual({ m: "eq", args: ["hidden", false] });
    expect(q.ops).toContainEqual({ m: "order", args: ["created_at", { ascending: false }] });
    expect(q.ops).toContainEqual({ m: "limit", args: [5] });
  });
  it("排除管理員自評（大小寫／空白不敏感）；adminEmail 預設讀 ADMIN_EMAIL", async () => {
    vi.stubEnv("ADMIN_EMAIL", "inrecmusic@gmail.com");
    const sb = makeSupabaseMock(() => ({ data: [row({ id: "a", user_email: " INRECMUSIC@gmail.com " }), row({ id: "b" })], error: null }));
    const cards = await getFeaturedReviews(sb);
    expect(cards.map((c) => c.id)).toEqual(["b"]);
  });
  it("查詢錯誤（例如欄位不存在）→ 回 []", async () => {
    const sb = makeSupabaseMock(() => ({ data: null, error: { message: "column featured does not exist" } }));
    expect(await getFeaturedReviews(sb)).toEqual([]);
  });
  it("db 為 null → 回 []", async () => {
    expect(await getFeaturedReviews(null)).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/featured-reviews.test.js`
Expected: FAIL（找不到模組 `./featured-reviews`）

- [ ] **Step 3: 實作**

```js
// lib/featured-reviews.js — 首頁課程評價跑馬燈的資料層（純函式＋一個查詢）。
// 只用真實評價：ratings.featured=true 且 hidden=false，排除管理員自評；不輸出 email。
export const REVIEW_TEXT_MAX = 120;   // 卡片文字上限（字），超過截斷加「…」
export const MARQUEE_MIN_CARDS = 3;   // 精選未滿此數整個區塊不顯示
export const LOOP_MIN = 8;            // 跑馬燈一圈至少幾張，不足整輪重複

const twDate = (iso) => {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).replace(/-/g, "/");
};

export function toReviewCards(rows = []) {
  return (rows || []).map((r) => {
    const raw = String(r.content ?? "").trim();
    const chars = [...raw]; // 以 code point 計字，CJK／emoji 不會被切半
    const text = !raw ? null : chars.length > REVIEW_TEXT_MAX ? chars.slice(0, REVIEW_TEXT_MAX).join("") + "…" : raw;
    const name = String(r.user_name ?? "").trim() || "學員";
    const score = Number(r.score);
    return { id: String(r.id), score: Number.isFinite(score) ? score : 0, text, name, date: twDate(r.created_at) };
  });
}

export function shouldShowMarquee(cards = []) {
  return (cards?.length || 0) >= MARQUEE_MIN_CARDS;
}

// 不足 min 張就整輪重複（不切半），循環接縫才不會露出同一張卡緊接著自己。
export function fillLoop(cards = [], min = LOOP_MIN) {
  if (!cards?.length) return [];
  const out = [];
  while (out.length < min) out.push(...cards);
  return out;
}

export async function getFeaturedReviews(db, { adminEmail = process.env.ADMIN_EMAIL, limit = 12 } = {}) {
  if (!db) return [];
  try {
    const { data, error } = await db
      .from("ratings")
      .select("id, score, content, user_name, user_email, created_at")
      .eq("featured", true)
      .eq("hidden", false)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return []; // 欄位未建（SQL 沒跑）等錯誤：首頁照常、只是不顯示跑馬燈
    const admin = String(adminEmail || "").trim().toLowerCase();
    const rows = (data || []).filter((r) => !admin || String(r.user_email || "").trim().toLowerCase() !== admin);
    return toReviewCards(rows);
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/featured-reviews.test.js`
Expected: PASS（全部）

- [ ] **Step 5: Commit**

```bash
git add lib/featured-reviews.js lib/featured-reviews.test.js
git commit -m "feat(reviews): 首頁精選評價資料層（轉卡片／門檻／補圈／查詢）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: 後台「首頁精選」開關

**Files:**
- Modify: `app/api/admin/ratings/route.js:32-33`（PATCH 白名單）
- Create: `app/api/admin/ratings/route.test.js`
- Modify: `app/admin/CourseRatingsPage.jsx`（`toggleHidden` 附近加 `toggleFeatured`；列表 badge 與按鈕）

**Interfaces:**
- Consumes: Task 1 的 `ratings.featured`。
- Produces: `PATCH /api/admin/ratings` body `{ id, featured: boolean }`。

- [ ] **Step 1: 寫失敗測試（API）**

```js
// app/api/admin/ratings/route.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/adminAuth", () => ({ verifyAdminToken: vi.fn(async () => ({ email: "admin@test" })) }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));

import { PATCH } from "./route";
import { getSupabaseAdmin } from "@/lib/supabase";
import { makeSupabaseMock } from "@/lib/test-helpers/supabase-mock";

const req = (body) => new Request("http://x/api/admin/ratings", { method: "PATCH", body: JSON.stringify(body) });

describe("PATCH /api/admin/ratings（後台切換隱藏／首頁精選）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("featured 可更新（轉布林）", async () => {
    const sb = makeSupabaseMock(() => ({ data: { id: "r1", featured: true }, error: null }));
    getSupabaseAdmin.mockReturnValue(sb);
    const res = await PATCH(req({ id: "r1", featured: 1 }));
    expect(res.status).toBe(200);
    expect(sb.calls[0].ops).toContainEqual({ m: "update", args: [{ featured: true }] });
  });

  it("hidden 與 featured 可同時更新；白名單外欄位被忽略", async () => {
    const sb = makeSupabaseMock(() => ({ data: { id: "r1" }, error: null }));
    getSupabaseAdmin.mockReturnValue(sb);
    await PATCH(req({ id: "r1", hidden: true, featured: false, score: 1, user_email: "x@x" }));
    expect(sb.calls[0].ops).toContainEqual({ m: "update", args: [{ hidden: true, featured: false }] });
  });

  it("缺 id → 400", async () => {
    getSupabaseAdmin.mockReturnValue(makeSupabaseMock(() => ({ data: null, error: null })));
    expect((await PATCH(req({ featured: true }))).status).toBe(400);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run app/api/admin/ratings/route.test.js`
Expected: 第 1、2 個 FAIL（update 內容沒有 `featured`）

- [ ] **Step 3: 放行 `featured`**

把 `app/api/admin/ratings/route.js` 的

```js
  const updates = {}; // 白名單：後台只切換 hidden（顯示/隱藏評價），防 mass-assignment
  if (body.hidden !== undefined) updates.hidden = !!body.hidden;
```

改成

```js
  const updates = {}; // 白名單：後台只切換 hidden（顯示/隱藏）與 featured（首頁精選），防 mass-assignment
  if (body.hidden !== undefined) updates.hidden = !!body.hidden;
  if (body.featured !== undefined) updates.featured = !!body.featured;
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run app/api/admin/ratings/route.test.js`
Expected: PASS

- [ ] **Step 5: 後台 UI**

在 `app/admin/CourseRatingsPage.jsx`，`toggleHidden` 函式之後加：

```jsx
  async function toggleFeatured(rating) {
    setSavingId(rating.id);
    try {
      const r = await api("/api/admin/ratings", {
        method: "PATCH",
        body: JSON.stringify({ id: rating.id, featured: !rating.featured }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      showToast(rating.featured ? "✅ 已從首頁移除" : "✅ 已加入首頁精選");
      fetchRatings();
    } catch (e) { showToast("❌ " + e.message); }
    finally { setSavingId(null); }
  }
```

狀態欄的 `{r.hidden && <span className={styles.pill} …>已隱藏</span>}` 之後加：

```jsx
                          {r.featured && !r.hidden && <span className={styles.pill} style={{ background: "#dbeafe", color: "#1e40af" }}>首頁精選</span>}
```

操作欄「回覆」按鈕與「隱藏／顯示」按鈕之間加：

```jsx
                          <button
                            className={styles.btnSmall}
                            style={r.featured ? { background: "#dbeafe", color: "#1e40af", borderColor: "#bfdbfe" } : {}}
                            onClick={() => toggleFeatured(r)}
                            disabled={savingId === r.id || r.hidden}
                            title={r.hidden ? "已隱藏的評價不能精選" : "勾選後出現在首頁跑馬燈"}
                          >
                            {r.featured ? "取消精選" : "首頁精選"}
                          </button>
```

- [ ] **Step 6: 手動確認**

Run: `npm run dev`，登入 `/admin` → 課程評價 → 對一則評價按「首頁精選」，重新整理後 badge 顯示「首頁精選」；按「隱藏」後精選按鈕變 disabled。

- [ ] **Step 7: Commit**

```bash
git add app/api/admin/ratings/route.js app/api/admin/ratings/route.test.js app/admin/CourseRatingsPage.jsx
git commit -m "feat(admin): 課程評價「首頁精選」開關

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `components/ReviewMarquee.jsx` 展示元件

**Files:**
- Create: `components/ReviewMarquee.jsx`
- Create: `components/ReviewMarquee.module.css`
- Test: `components/ReviewMarquee.test.jsx`

**Interfaces:**
- Consumes: Task 2 的 `shouldShowMarquee`、`fillLoop`、card 形狀 `{ id, score, text, name, date }`。
- Produces: `<ReviewMarquee cards={cards} rating={number|null} ratingCount={number} />`；`cards` 不足 3 張回 `null`。

- [ ] **Step 1: 寫失敗測試**

```jsx
// @vitest-environment jsdom
// components/ReviewMarquee.test.jsx
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import ReviewMarquee from "./ReviewMarquee";

afterEach(cleanup);

const card = (i, text = null) => ({ id: `r${i}`, score: 5, text, name: `學員${i}`, date: "2026/10/05" });

describe("ReviewMarquee（首頁課程評價跑馬燈）", () => {
  it("不足 3 張不渲染", () => {
    const { container } = render(<ReviewMarquee cards={[card(1), card(2)]} rating={5} ratingCount={2} />);
    expect(container.innerHTML).toBe("");
  });

  it("3 張：標題、星等、每張暱稱／日期；無文字卡沒有文字段落；補到 8 張再重複一份做無縫循環", () => {
    render(<ReviewMarquee cards={[card(1, "很有幫助"), card(2), card(3)]} rating={5} ratingCount={4} />);
    expect(screen.getByRole("heading", { name: "課程評價" })).toBeTruthy();
    expect(screen.getByText("5.0")).toBeTruthy();
    expect(screen.getByText("4 則學員評價")).toBeTruthy();
    // 3 張 → fillLoop 到 9 張 → track 兩份 = 18 張
    expect(screen.getAllByText("學員1")).toHaveLength(6);
    expect(screen.getAllByText("很有幫助")).toHaveLength(6);
    const blank = screen.getAllByTestId("review-card").filter((el) => el.getAttribute("data-has-text") === "false");
    expect(blank.length).toBe(12); // 學員2、學員3 各 6 份
    blank.forEach((el) => expect(el.querySelector("p")).toBeNull());
  });

  it("第二份 track 對輔助科技隱藏；星星以 aria-label 讀出分數", () => {
    const { container } = render(<ReviewMarquee cards={[card(1), card(2), card(3)]} rating={5} ratingCount={3} />);
    expect(container.querySelectorAll('[aria-hidden="true"][data-track="clone"]')).toHaveLength(1);
    expect(screen.getAllByLabelText("5 顆星").length).toBeGreaterThan(0);
  });

  it("rating 為 null（hero 不顯示星等）時只顯示標題，不出現 NaN", () => {
    const { container } = render(<ReviewMarquee cards={[card(1), card(2), card(3)]} rating={null} ratingCount={0} />);
    expect(container.textContent).not.toContain("NaN");
    expect(screen.queryByText(/則學員評價/)).toBeNull();
  });

  it("不出現任何 email 樣式字串", () => {
    const { container } = render(<ReviewMarquee cards={[card(1), card(2), card(3)]} rating={5} ratingCount={3} />);
    expect(container.textContent).not.toMatch(/@/);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run components/ReviewMarquee.test.jsx`
Expected: FAIL（找不到模組）

- [ ] **Step 3: 寫 CSS Module**

```css
/* components/ReviewMarquee.module.css — hero 正下方的評價跑馬燈，底色與 .hero 同（#05070b）連成一片 */
.section { background: #05070b; color: #f8fafc; padding: 40px 0 44px; overflow: hidden; }
.head { max-width: var(--container-max); margin: 0 auto; padding: 0 var(--container-pad); display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
.title { margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -.01em; color: #fff; font-family: var(--type-heading); }
.avg { font-size: 22px; font-weight: 800; color: #fff; font-family: var(--type-numeric); }
.stars { color: var(--gold-mid); font-size: 15px; letter-spacing: 1px; }
.count { font-size: 14px; color: #94a3b8; }
.hint { margin-left: auto; font-size: 13px; color: #64748b; }

.viewport { position: relative; margin-top: 24px; }
.viewport::before, .viewport::after { content: ""; position: absolute; top: 0; bottom: 0; width: 72px; pointer-events: none; z-index: 1; }
.viewport::before { left: 0; background: linear-gradient(90deg, #05070b, rgba(5,7,11,0)); }
.viewport::after { right: 0; background: linear-gradient(270deg, #05070b, rgba(5,7,11,0)); }

.track { display: flex; gap: 20px; width: max-content; padding-left: 20px;
  animation: marquee var(--marquee-duration, 48s) linear infinite; }
.viewport:hover .track, .viewport:active .track { animation-play-state: paused; }
/* 第二份 track 的外層只是分組（aria-hidden 用），不佔版面；reduced-motion 時整個隱藏 */
.clone { display: contents; }
@keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }

.card { width: 320px; box-sizing: border-box; flex: 0 0 auto; min-height: 176px;
  background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); border-radius: var(--radius-md);
  padding: 22px 24px; display: flex; flex-direction: column; gap: 12px; }
.cardStars { color: var(--gold-mid); font-size: 15px; letter-spacing: 1px; }
.text { margin: 0; font-size: 16px; line-height: 1.7; color: #fff; flex: 1; overflow-wrap: anywhere; }
.meta { font-size: 13px; color: #94a3b8; margin-top: auto; }
.meta b { color: #e2e8f0; font-weight: 600; }
.foot { max-width: var(--container-max); margin: 20px auto 0; padding: 0 var(--container-pad); font-size: 13px; color: #64748b; }

@media (max-width: 600px) {
  .section { padding: 32px 0 36px; }
  .title { font-size: 22px; } .avg { font-size: 18px; }
  .hint { display: none; }
  .card { width: 250px; min-height: 156px; padding: 18px; }
  .text { font-size: 15px; }
  .track { gap: 12px; padding-left: 16px; }
  .viewport::before, .viewport::after { width: 40px; }
}

/* 減少動態：不跑、改橫向可滑；第二份 track 由元件不渲染（aria-hidden clone）改成 display:none */
@media (prefers-reduced-motion: reduce) {
  .track { animation: none; width: auto; overflow-x: auto; -webkit-overflow-scrolling: touch; padding-right: 20px; scroll-snap-type: x proximity; }
  .card { scroll-snap-align: start; }
  .clone { display: none; }
  .viewport::before, .viewport::after { display: none; }
}
```

- [ ] **Step 4: 寫元件**

```jsx
// components/ReviewMarquee.jsx — 首頁 hero 正下方的「課程評價」跑馬燈（純展示，資料由 page.jsx 伺服端帶入）。
// 卡片無文字就留空白（星星＋暱稱＋日期），不補字。cards 不足 3 張整段不渲染。
import styles from "./ReviewMarquee.module.css";
import { shouldShowMarquee, fillLoop } from "@/lib/featured-reviews";

const STAR = "★";
const Stars = ({ score, className }) => (
  <span className={className} aria-label={`${score} 顆星`} role="img">{STAR.repeat(Math.max(0, Math.min(5, Math.round(score))))}</span>
);

function Card({ c }) {
  return (
    <article className={styles.card} data-testid="review-card" data-has-text={c.text ? "true" : "false"}>
      <Stars score={c.score} className={styles.cardStars} />
      {c.text && <p className={styles.text}>{c.text}</p>}
      <div className={styles.meta}><b>{c.name}</b> · {c.date}</div>
    </article>
  );
}

export default function ReviewMarquee({ cards = [], rating = null, ratingCount = 0 }) {
  if (!shouldShowMarquee(cards)) return null;
  const loop = fillLoop(cards);
  const showRating = rating != null && Number.isFinite(Number(rating)) && ratingCount >= 3;
  // 每張約 4 秒；兩份 track 平移 -50% 就是一輪
  const duration = `${Math.max(24, loop.length * 4)}s`;

  return (
    <section id="reviews" className={styles.section} aria-label="課程評價">
      <div className={styles.head}>
        <h2 className={styles.title}>課程評價</h2>
        {showRating && (
          <>
            <span className={styles.avg}>{Number(rating).toFixed(1)}</span>
            <Stars score={rating} className={styles.stars} />
            <span className={styles.count}>{ratingCount} 則學員評價</span>
          </>
        )}
        <span className={styles.hint}>滑鼠移上暫停</span>
      </div>
      <div className={styles.viewport}>
        <div className={styles.track} style={{ "--marquee-duration": duration }}>
          {loop.map((c, i) => <Card key={`a-${c.id}-${i}`} c={c} />)}
          {/* 第二份只為無縫循環，對輔助科技隱藏；reduced-motion 時 CSS 直接 display:none */}
          <div className={styles.clone} data-track="clone" aria-hidden="true">
            {loop.map((c, i) => <Card key={`b-${c.id}-${i}`} c={c} />)}
          </div>
        </div>
      </div>
      <p className={styles.foot}>評價皆由已購課學員在教室內留下，未經改寫。</p>
    </section>
  );
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run components/ReviewMarquee.test.jsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add components/ReviewMarquee.jsx components/ReviewMarquee.module.css components/ReviewMarquee.test.jsx
git commit -m "feat(home): 課程評價跑馬燈元件（CSS 循環、hover 暫停、reduced-motion 可滑）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: 接進首頁（`page.jsx` 查詢 → `HomeClient` → hero 下方）

**Files:**
- Modify: `app/page.jsx:16`（`initialStats` 旁一起查）與 `:80`（傳 prop）
- Modify: `app/HomeClient.jsx:1-25`（import）、`:409`（props）、`:766-769`（hero `</section>` 之後插入）

**Interfaces:**
- Consumes: `getFeaturedReviews(db)`（Task 2）、`ReviewMarquee`（Task 4）。
- Produces: `HomeClient` 新 prop `reviews = []`。

- [ ] **Step 1: page.jsx 查詢**

`app/page.jsx` 開頭 import 加：

```js
import { getFeaturedReviews } from "@/lib/featured-reviews";
```

把

```js
  const initialStats = db ? await getSiteStats(db).catch(() => null) : null;
```

改成

```js
  // 社會證明數字與首頁精選評價同一趟並行（都隨 60s revalidate 快取）；評價查詢失敗回 []，首頁照常只是不顯示跑馬燈
  const [initialStats, reviews] = db
    ? await Promise.all([getSiteStats(db).catch(() => null), getFeaturedReviews(db)])
    : [null, []];
```

`<HomeClient … initialStats={initialStats} />` 加 `reviews={reviews}`。

- [ ] **Step 2: HomeClient 接 prop、放元件**

`app/HomeClient.jsx` import 區加：

```js
import ReviewMarquee from "@/components/ReviewMarquee";
```

函式簽名改成：

```js
export default function HomeClient({ sale, termsVersion = null, leadCapture = false, initialStats = null, reviews = [] }) {
```

在 hero 的 `</section>` 與 `{/* INTRO — editorial "polished symmetric" */}` 之間插入：

```jsx
        {/* 課程評價跑馬燈：hero 正下方、同底色；精選未滿 3 則元件自己回 null */}
        <ReviewMarquee cards={reviews} rating={stats?.rating ?? null} ratingCount={stats?.ratingCount ?? 0} />
```

- [ ] **Step 3: 跑既有首頁測試與整套**

Run: `npx vitest run`
Expected: 全部 PASS（`reviews` 預設 `[]` → 既有測試不受影響）。若有測試直接 render `HomeClient` 且斷言 hero 後第一個 section 是 intro，依實際失敗訊息把 `reviews` 補成 `[]` 即可，不改斷言語意。

- [ ] **Step 4: 本機目視**

Run: `npm run dev` → 開 `http://localhost:3000`。先到後台把 3 則評價勾「首頁精選」，重新整理首頁（ISR 60s，開發模式即時）：hero 下方出現深底跑馬燈、連續滾動、滑鼠移上暫停；縮到 390px 寬卡片變窄、仍可滾；在系統「減少動態」下靜止可橫向滑動。取消精選剩 2 則 → 區塊消失。

- [ ] **Step 5: Commit**

```bash
git add app/page.jsx app/HomeClient.jsx
git commit -m "feat(home): hero 正下方掛課程評價跑馬燈（伺服端查詢、ISR 60s）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: 把評分表單抽成 `RatingForm`（`RatingTab` 共用）

**Files:**
- Create: `components/classroom/RatingForm.jsx`
- Modify: `components/classroom/RatingTab.jsx`（改成薄殼）
- Test: `components/classroom/RatingForm.test.jsx`

**Interfaces:**
- Produces: `<RatingForm token onDone={() => {}} compact={false} />`：星星＋選填心得＋送出；成功（或 API 回 `already_rated`）呼叫 `onDone()`。`compact` 只影響間距（推力卡片用）。
- `RatingTab` 行為不變：`done` 後顯示「感謝你的評價！」。

- [ ] **Step 1: 寫失敗測試**

```jsx
// @vitest-environment jsdom
// components/classroom/RatingForm.test.jsx
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("./shared", () => ({ F: "sans-serif", freshToken: async (t) => t }));

import RatingForm from "./RatingForm";

beforeEach(() => { global.fetch = vi.fn(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("RatingForm", () => {
  it("沒選星星送出鈕 disabled；選 5 星後送出打 /api/classroom/rating 並呼叫 onDone", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const onDone = vi.fn();
    render(<RatingForm token="tok" onDone={onDone} />);
    const submit = screen.getByRole("button", { name: "送出評分" });
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getAllByRole("button", { name: /星/ })[4]);
    fireEvent.change(screen.getByPlaceholderText("分享你的學習心得（選填）"), { target: { value: "很棒" } });
    fireEvent.click(submit);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/classroom/rating");
    expect(JSON.parse(init.body)).toEqual({ score: 5, content: "很棒" });
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("API 回 already_rated 也算完成（呼叫 onDone）", async () => {
    global.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: "already_rated" }) });
    const onDone = vi.fn();
    render(<RatingForm token="tok" onDone={onDone} />);
    fireEvent.click(screen.getAllByRole("button", { name: /星/ })[2]);
    fireEvent.click(screen.getByRole("button", { name: "送出評分" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("其他錯誤顯示訊息、不呼叫 onDone", async () => {
    global.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: "not_purchased" }) });
    const onDone = vi.fn();
    render(<RatingForm token="tok" onDone={onDone} />);
    fireEvent.click(screen.getAllByRole("button", { name: /星/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: "送出評分" }));
    await waitFor(() => expect(screen.getByText("not_purchased")).toBeTruthy());
    expect(onDone).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run components/classroom/RatingForm.test.jsx`
Expected: FAIL（找不到模組）

- [ ] **Step 3: 建 `RatingForm`（把 `RatingTab` 的表單搬過來，星星按鈕加 aria-label）**

```jsx
// components/classroom/RatingForm.jsx — 課程評分表單（星星＋選填心得），播放頁「課程評價」分頁與儀表板推力卡片共用。
"use client";
import { useState } from "react";
import { freshToken, F } from "./shared";

const LABELS = ["", "有點失望", "普通", "還不錯", "很好", "非常推薦！"];

export default function RatingForm({ token, onDone, compact = false }) {
  const [hover, setHover]       = useState(0);
  const [selected, setSelected] = useState(0);
  const [content, setContent]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr]           = useState("");

  async function submit() {
    if (!selected) return;
    setSubmitting(true); setErr("");
    try {
      const tk = await freshToken(token);
      const r = await fetch("/api/classroom/rating", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ score: selected, content }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok && json.error !== "already_rated") throw new Error(json.error || "送出失敗");
      onDone?.();
    } catch (e) { setErr(e.message === "unauthorized" ? "登入狀態逾時，請重新整理頁面再送一次" : (e.message || "送出失敗，請稍後再試")); }
    finally { setSubmitting(false); }
  }

  return (
    <div>
      <p style={{ fontSize: 15, fontWeight: 600, color: "inherit", margin: compact ? "0 0 8px" : "0 0 14px" }}>你對這堂課的評分是？</p>
      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        {[1, 2, 3, 4, 5].map(i => (
          <button key={i} type="button" aria-label={`${i} 星`}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(0)}
            onClick={() => setSelected(i)}
            style={{ background: "none", border: 0, cursor: "pointer", fontSize: 30, padding: 2, lineHeight: 1 }}
          >
            {(hover || selected) >= i ? "⭐" : "☆"}
          </button>
        ))}
      </div>
      {selected > 0 && <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 12px" }}>{LABELS[selected]}</p>}
      <textarea value={content} onChange={e => setContent(e.target.value)}
        placeholder="分享你的學習心得（選填）" rows={compact ? 2 : 3}
        style={{
          width: "100%", background: "#f1f5f9",
          border: "1px solid rgba(0,0,0,0.1)", borderRadius: 10,
          padding: "10px 12px", color: "#0f172a", fontSize: 13.5,
          fontFamily: F, resize: "vertical", outline: "none",
          boxSizing: "border-box", marginBottom: 12,
        }}
      />
      {err && <p style={{ color: "#dc2626", fontSize: 13, margin: "0 0 10px" }}>{err}</p>}
      <button type="button" onClick={submit} disabled={!selected || submitting}
        style={{
          background: "#2563eb", color: "#fff", border: 0, borderRadius: 980,
          padding: "8px 22px", fontSize: 13, fontWeight: 500, cursor: "pointer",
          fontFamily: F, opacity: !selected ? 0.35 : 1, transition: "opacity .15s",
        }}
      >
        {submitting ? "送出中…" : "送出評分"}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: `RatingTab` 改薄殼（整檔取代）**

```jsx
"use client";
import { useState } from "react";
import RatingForm from "./RatingForm";

/* ── RatingTab：播放頁「課程評價」分頁，表單共用 RatingForm ───────────────── */
export default function RatingTab({ token }) {
  const [done, setDone] = useState(false);

  if (done) return (
    <div style={{ textAlign: "center", paddingTop: 48 }}>
      <div style={{ fontSize: 52, marginBottom: 14 }}>⭐</div>
      <p style={{ fontWeight: 600, color: "#0f172a", fontSize: 18, margin: "0 0 6px" }}>感謝你的評價！</p>
      <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>你的回饋對我們非常重要</p>
    </div>
  );

  return <RatingForm token={token} onDone={() => setDone(true)} />;
}
```

- [ ] **Step 5: 跑測試**

Run: `npx vitest run components/classroom`
Expected: PASS（含既有播放頁測試）

- [ ] **Step 6: Commit**

```bash
git add components/classroom/RatingForm.jsx components/classroom/RatingForm.test.jsx components/classroom/RatingTab.jsx
git commit -m "refactor(classroom): 評分表單抽成 RatingForm 供儀表板推力共用

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: `bootstrap` 回 `rated`

**Files:**
- Modify: `app/api/classroom/bootstrap/route.js:81-104`（`Promise.all` 多一個查詢）與 `:140` 附近（`out.rated`）
- Test: 既有 `app/api/classroom/bootstrap/route.test.js`（若存在則補 case；不存在則建）

**Interfaces:**
- Produces: bootstrap 回應多 `rated: boolean`（查詢失敗 → `true`，fail-safe 不打擾）。

- [ ] **Step 1: 看既有測試檔**

Run: `ls app/api/classroom/bootstrap/`。若有 `route.test.js`，在其 describe 內加下面兩個 case（mock 方式依該檔既有寫法）；若沒有，建新檔並用 `makeSupabaseMock`＋mock `@/lib/supabase`／auth 的方式比照 `app/api/admin/comment-replies/route.test.js`。兩個 case 的斷言：

```js
  it("已評分 → rated: true；未評分 → false", async () => {
    // resolver：table === "ratings" 時回 { count: 1 }（或 0）
  });
  it("ratings 查詢失敗 → rated: true（fail-safe，不彈推力卡）", async () => {
    // resolver：table === "ratings" 時回 { count: null, error: { message: "boom" } }
  });
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run app/api/classroom/bootstrap`
Expected: 新 case FAIL（回應沒有 `rated`）

- [ ] **Step 3: 實作**

在 `Promise.all([...])` 陣列最後加一項（`scoreRes` 之後）：

```js
    // 儀表板「給課程評分」推力：已評分就不再邀請。head count 一筆，與其他查詢並行。
    supabase.from("ratings").select("id", { count: "exact", head: true }).eq("user_id", user.id),
```

解構多接 `ratedRes`：

```js
  const [chapRes, vidRes, progRes, countRes, annRes, matRes, gameRes, scoreRes, ratedRes] = await Promise.all([
```

在 `out.percentage = …` 之後加：

```js
  // 查詢失敗視為已評分（fail-safe：寧可不邀請，也不要一直彈卡撞 already_rated）
  if (ratedRes.error) console.error("[bootstrap] rated:", ratedRes.error.message);
  out.rated = ratedRes.error ? true : (ratedRes.count || 0) > 0;
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run app/api/classroom/bootstrap`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/classroom/bootstrap/route.js app/api/classroom/bootstrap/route.test.js
git commit -m "feat(bootstrap): 回傳 rated（儀表板評分推力用，查詢失敗視為已評分）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: `lib/rating-nudge.js` 顯示條件

**Files:**
- Create: `lib/rating-nudge.js`
- Test: `lib/rating-nudge.test.js`

**Interfaces:**
- Consumes: `isTrialVideo` from `lib/early-access.js`（標題以「試看」開頭）。
- Produces:
  - `shouldNudge({ rated, chapters, videos, progress, dismissed }) → boolean`
  - `readNudgeDismissed(storage) → boolean`、`writeNudgeDismissed(storage)`（key `inrec_rating_nudge_dismissed`，寫法比照 `lib/announcement-state.js`）

- [ ] **Step 1: 寫失敗測試**

```js
// lib/rating-nudge.test.js
import { describe, it, expect } from "vitest";
import { shouldNudge, readNudgeDismissed, writeNudgeDismissed } from "./rating-nudge";

const chapters = [{ id: "c2", sort_order: 1 }, { id: "c1", sort_order: 0 }]; // 故意亂序
const videos = [
  { id: "t", chapter_id: "c1", title: "試看 開場" },
  { id: "v1", chapter_id: "c1", title: "1-1 認識鍵盤" },
  { id: "v2", chapter_id: "c1", title: "1-2 手型" },
  { id: "v3", chapter_id: "c2", title: "2-1 音名" },
];
const done = (...ids) => ids.map((video_id) => ({ video_id, completed: true }));
const base = { rated: false, chapters, videos, progress: done("v1", "v2"), dismissed: false };

describe("shouldNudge（看完第 1 章正課且未評分、未關閉才邀請）", () => {
  it("第 1 章正課全看完、未評分、未關閉 → true（試看單元不計、第 2 章不要求）", () => {
    expect(shouldNudge(base)).toBe(true);
  });
  it("已評分 → false", () => expect(shouldNudge({ ...base, rated: true })).toBe(false));
  it("本裝置關閉過 → false", () => expect(shouldNudge({ ...base, dismissed: true })).toBe(false));
  it("第 1 章還有正課沒看完 → false", () => expect(shouldNudge({ ...base, progress: done("v1") })).toBe(false));
  it("只看完試看單元 → false", () => expect(shouldNudge({ ...base, progress: done("t") })).toBe(false));
  it("第 1 章只有試看單元（沒有正課）→ false，不能把 0 支全看完當完成", () => {
    expect(shouldNudge({ ...base, videos: [videos[0], videos[3]], progress: done("t") })).toBe(false);
  });
  it("沒有章節／影片 → false", () => {
    expect(shouldNudge({ ...base, chapters: [], videos: [] })).toBe(false);
  });
  it("progress 的 completed 為 false 不算", () => {
    expect(shouldNudge({ ...base, progress: [{ video_id: "v1", completed: true }, { video_id: "v2", completed: false }] })).toBe(false);
  });
});

describe("dismissed 記在裝置", () => {
  const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
  it("預設 false；寫入後 true；storage 為 null 或丟例外一律 false／靜默", () => {
    const s = mem();
    expect(readNudgeDismissed(s)).toBe(false);
    writeNudgeDismissed(s);
    expect(readNudgeDismissed(s)).toBe(true);
    expect(readNudgeDismissed(null)).toBe(false);
    expect(() => writeNudgeDismissed({ setItem() { throw new Error("blocked"); } })).not.toThrow();
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/rating-nudge.test.js`
Expected: FAIL（找不到模組）

- [ ] **Step 3: 實作**

```js
// lib/rating-nudge.js — 儀表板「給課程評分」推力卡片的顯示條件（純函式）＋本裝置關閉旗標。
// 條件：未評分、第 1 章（sort_order 最小）的正課單元全部 completed（試看不算）、本裝置沒關過。
import { isTrialVideo } from "./early-access.js";

const KEY = "inrec_rating_nudge_dismissed";

export function shouldNudge({ rated, chapters = [], videos = [], progress = [], dismissed = false } = {}) {
  if (rated || dismissed) return false;
  if (!chapters.length) return false;
  const first = [...chapters].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];
  const course = videos.filter((v) => v.chapter_id === first.id && !isTrialVideo(v));
  if (!course.length) return false; // 第 1 章沒有正課（只有試看）不算完成
  const doneIds = new Set(progress.filter((p) => p.completed).map((p) => p.video_id));
  return course.every((v) => doneIds.has(v.id));
}

export function readNudgeDismissed(storage) {
  try { return storage?.getItem(KEY) === "1"; } catch { return false; }
}

export function writeNudgeDismissed(storage) {
  try { storage?.setItem(KEY, "1"); } catch { /* 隱私模式／被封鎖：靜默 */ }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/rating-nudge.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/rating-nudge.js lib/rating-nudge.test.js
git commit -m "feat(classroom): 評分推力顯示條件純函式（看完第 1 章正課、未評分、未關閉）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: `RatingNudge` 卡片掛進兩版儀表板

**Files:**
- Create: `components/classroom/RatingNudge.jsx`
- Test: `components/classroom/RatingNudge.test.jsx`
- Modify: `app/classroom/HubLegacy.jsx`（state 多 `rated`；`<HubAnnouncements ann={ann} />` 之後插入）
- Modify: `app/classroom/HubV3.jsx`（同上，`{ann.sorted.length > 0 && …}` 那行之後插入）

**Interfaces:**
- Consumes: `shouldNudge`、`readNudgeDismissed`、`writeNudgeDismissed`（Task 8）、`RatingForm`（Task 6）、bootstrap 的 `rated`（Task 7）。
- Produces: `<RatingNudge token rated chapters videos progress />`，自己管 dismissed（mount 後讀 localStorage，避免 SSR hydration 不一致）。

- [ ] **Step 1: 寫失敗測試**

```jsx
// @vitest-environment jsdom
// components/classroom/RatingNudge.test.jsx
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("./shared", () => ({ F: "sans-serif", freshToken: async (t) => t }));

import RatingNudge from "./RatingNudge";

const chapters = [{ id: "c1", sort_order: 0 }];
const videos = [{ id: "v1", chapter_id: "c1", title: "1-1" }];
const doneAll = [{ video_id: "v1", completed: true }];
const props = { token: "tok", rated: false, chapters, videos, progress: doneAll };

beforeEach(() => { window.localStorage.clear(); global.fetch = vi.fn(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("RatingNudge（看完第 1 章後的評分邀請）", () => {
  it("條件成立顯示卡片與表單", async () => {
    render(<RatingNudge {...props} />);
    await waitFor(() => expect(screen.getByText("看完第 1 章了，給這堂課一個評分吧")).toBeTruthy());
    expect(screen.getByRole("button", { name: "送出評分" })).toBeTruthy();
  });
  it("已評分不顯示", () => {
    const { container } = render(<RatingNudge {...props} rated={true} />);
    expect(container.innerHTML).toBe("");
  });
  it("按「先不用」→ 收起並寫 localStorage，下次 mount 不再顯示", async () => {
    const { container, unmount } = render(<RatingNudge {...props} />);
    await waitFor(() => screen.getByText("先不用"));
    fireEvent.click(screen.getByText("先不用"));
    expect(container.innerHTML).toBe("");
    expect(window.localStorage.getItem("inrec_rating_nudge_dismissed")).toBe("1");
    unmount();
    const r2 = render(<RatingNudge {...props} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(r2.container.innerHTML).toBe("");
  });
  it("送出成功 → 顯示感謝並寫 localStorage", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(<RatingNudge {...props} />);
    await waitFor(() => screen.getByRole("button", { name: "5 星" }));
    fireEvent.click(screen.getByRole("button", { name: "5 星" }));
    fireEvent.click(screen.getByRole("button", { name: "送出評分" }));
    await waitFor(() => expect(screen.getByText("感謝你的評價！")).toBeTruthy());
    expect(window.localStorage.getItem("inrec_rating_nudge_dismissed")).toBe("1");
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run components/classroom/RatingNudge.test.jsx`
Expected: FAIL（找不到模組）

- [ ] **Step 3: 寫元件**

```jsx
// components/classroom/RatingNudge.jsx — 儀表板「看完第 1 章，給課程評分」推力卡片。
// 顯示條件在 lib/rating-nudge.js（純函式）；關閉／送出後記在本裝置 localStorage，不再出現。
"use client";
import { useEffect, useState } from "react";
import RatingForm from "./RatingForm";
import { shouldNudge, readNudgeDismissed, writeNudgeDismissed } from "@/lib/rating-nudge";

export default function RatingNudge({ token, rated, chapters = [], videos = [], progress = [] }) {
  const [dismissed, setDismissed] = useState(true); // SSR／首次 render 先當作關閉，mount 後再讀 localStorage，避免 hydration 不一致
  const [thanks, setThanks] = useState(false);

  useEffect(() => {
    setDismissed(readNudgeDismissed(typeof window !== "undefined" ? window.localStorage : null));
  }, []);

  const close = () => { writeNudgeDismissed(typeof window !== "undefined" ? window.localStorage : null); setDismissed(true); };
  const onDone = () => { writeNudgeDismissed(typeof window !== "undefined" ? window.localStorage : null); setThanks(true); };

  if (thanks) return (
    <section className="nudge" aria-live="polite" style={wrap}>
      <p style={{ margin: 0, fontWeight: 600 }}>感謝你的評價！</p>
      <p style={{ margin: "4px 0 0", fontSize: 14, opacity: .75 }}>你的回饋對我們非常重要</p>
    </section>
  );
  if (!shouldNudge({ rated, chapters, videos, progress, dismissed })) return null;

  return (
    <section className="nudge" aria-label="給課程評分" style={wrap}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 17, fontWeight: 700 }}>看完第 1 章了，給這堂課一個評分吧</h2>
        <button type="button" onClick={close} style={ghost}>先不用</button>
      </div>
      <RatingForm token={token} onDone={onDone} compact />
    </section>
  );
}

const wrap = { margin: "0 0 24px", padding: "18px 20px", borderRadius: 16, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.05)", color: "inherit" };
const ghost = { background: "none", border: 0, cursor: "pointer", color: "inherit", opacity: .7, fontSize: 14, padding: "2px 4px", whiteSpace: "nowrap" };
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run components/classroom/RatingNudge.test.jsx`
Expected: PASS

- [ ] **Step 5: 掛進 `HubLegacy.jsx`**

import 區加：

```js
import RatingNudge from "@/components/classroom/RatingNudge";
```

state 區（`const [earlyAccess, setEarlyAccess] = …` 之後）加：

```js
  const [rated, setRated]                 = useState(true); // bootstrap 帶回；預設 true＝資料未到前不彈評分邀請
```

bootstrap 成功區塊 `setEarlyAccess(d.earlyAccess);` 之後加：

```js
          setRated(d.rated !== false); // 只有明確 false 才邀請
```

`<HubAnnouncements ann={ann} />` 之後、`<div className="sect-t">課程章節</div>` 之前插入：

```jsx
        <RatingNudge token={token} rated={rated} chapters={chapters} videos={videos} progress={progress} />
```

- [ ] **Step 6: 掛進 `HubV3.jsx`**

同樣加 import、`rated` state（找到該檔 bootstrap 成功後 `setAnnouncements(d.announcements || [])` 那行，其後加 `setRated(d.rated !== false);`），並在 `{ann.sorted.length > 0 && <div id="announcements"><HubAnnouncements ann={ann} /></div>}` 之後插入：

```jsx
        <div className="wrap"><RatingNudge token={token} rated={rated} chapters={chapters} videos={videos} progress={progress} /></div>
```

（HubV3 的 `chapters`／`videos`／`progress`／`token` state 名稱以該檔實際變數為準；若 progress 存在 model 內，傳 bootstrap 原始 `progress` 陣列。）

- [ ] **Step 7: 跑整套測試**

Run: `npx vitest run`
Expected: 全部 PASS（`page.hero.test.jsx` 的 base 資料沒有 `rated` → `d.rated !== false` 為 true → 不彈卡，既有斷言不受影響）。

- [ ] **Step 8: 本機目視**

Run: `npm run dev`，以已購課測試帳號進 `/classroom`：第 1 章正課全看完且未評分時卡片出現在公告區下方；「先不用」收起、重新整理不再出現；送出 5 星後顯示感謝，後台「課程評價」多一則。

- [ ] **Step 9: Commit**

```bash
git add components/classroom/RatingNudge.jsx components/classroom/RatingNudge.test.jsx app/classroom/HubLegacy.jsx app/classroom/HubV3.jsx
git commit -m "feat(classroom): 看完第 1 章後儀表板出現評分邀請（兩版儀表板）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: 文件與部署

**Files:**
- Modify: `CLAUDE.md`（「架構決策」加一條；「主要 API 路由」`bootstrap` 說明補 `rated`）

- [ ] **Step 1: CLAUDE.md 補說明**

「架構決策（重要）」清單加一條：

```
- **首頁課程評價跑馬燈**（2026-10）：hero 正下方 `components/ReviewMarquee.jsx`，資料只來自 `ratings.featured=true AND hidden=false`（後台「課程評價」的「首頁精選」開關；排除 `ADMIN_EMAIL` 自評、不輸出 email），`app/page.jsx` 伺服端查（`lib/featured-reviews.js`，隨 ISR 60s）。精選未滿 3 則整段不渲染；無文字評價卡片留空白；120 字截斷；hover 暫停、`prefers-reduced-motion` 退成可滑清單。教室儀表板另有「看完第 1 章給評分」推力卡（`components/classroom/RatingNudge.jsx`、條件 `lib/rating-nudge.js`、表單與播放頁共用 `RatingForm`），bootstrap 多回 `rated`。
```

「主要 API 路由」`/api/classroom/bootstrap` 那列說明末尾加「／是否已評分 `rated`」。

- [ ] **Step 2: 跑整套測試＋lint**

Run: `npx vitest run && npm run lint`
Expected: 全部 PASS、lint 無錯誤。

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: 首頁評價跑馬燈與評分推力說明

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 4: 部署（使用者確認後）**

依 memory 的部署流程：`git push origin HEAD:audit/2026-09-20` → `vercel deploy --prod --yes` → `vercel inspect inrecordmusic.com` 確認 alias。部署前確認 Task 1 的 SQL 已在正式庫跑過。部署後到後台勾 3 則以上「首頁精選」，1 分鐘內首頁出現跑馬燈。
