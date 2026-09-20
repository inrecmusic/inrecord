# 2026-09-20 健檢待決項目 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 2026-09-20 健檢報告中「需要決定」的 6 件，依已核可的建議實作完成。

**Architecture:** 兩件是環境／路由設定（無測試）；四件是程式碼修改，全部走既有慣例：可測邏輯抽到 `lib/` 並加 vitest，路由層只做組裝。動到正式資料庫的僅一段 SQL（Task 3），且程式碼在 SQL 未跑之前也必須安全。

**Tech Stack:** Next.js 14 App Router、Supabase（service role）、PAYUNi、Vercel env／redirects、vitest。

**Spec:** 健檢報告 artifact `https://claude.ai/code/artifact/f617126d-9869-4e40-b00f-9ddff887d466`（決定 1–6 各附建議）

## Global Constraints

- 最少 code、不影響其他現有功能；每個修改都要能單獨回退。
- 所有改動在 worktree 分支 `audit/2026-09-20` 完成 → `npx vitest run` 全綠 → `npx next lint` 無新警告 → Vercel preview；`vercel --prod` 一律先問過。
- 中文文案：台灣繁中口語，避免支語；顯示文字沿用 `word-break: keep-all; line-break: strict`。
- 日期／時間一律以 `Asia/Taipei` 呈現，不可依賴伺服器時區（Vercel 是 UTC）。
- 金額顯示一律 `toLocaleString("en-US")`。
- 不得在 log 或 API 回應中輸出買家 PII。

---

### Task 1: Preview 環境的站台網址改指向 preview 別名

**Files:**
- 無程式碼變更（Vercel 環境變數）

**Interfaces:**
- Consumes: 無
- Produces: Preview 部署的 `NEXT_PUBLIC_SITE_URL` = `https://inrecord-preview-inrec.vercel.app`

**背景：** Preview 的 `NEXT_PUBLIC_SITE_URL` 目前是 `https://inrecord-swart.vercel.app`（正式部署的別名）。在 preview 站留信箱寄出的試看信連結會落到正式主機，這正是 2026-09-20 試看 403 的來源（Bunny 白名單當時沒放 swart）。

- [ ] **Step 1: 確認目前值**

Run: `npx vercel env ls | grep NEXT_PUBLIC_SITE_URL`
Expected: Production 與 Preview 各一筆。

- [ ] **Step 2: 移除 Preview 舊值**

```bash
npx vercel env rm NEXT_PUBLIC_SITE_URL preview --yes
```

- [ ] **Step 3: 寫入新值**

```bash
printf 'https://inrecord-preview-inrec.vercel.app' | npx vercel env add NEXT_PUBLIC_SITE_URL preview
```

- [ ] **Step 4: 重新部署 preview 並驗證**

```bash
npx vercel deploy --yes
npx vercel alias set <新部署網址> inrecord-preview-inrec.vercel.app
curl -s https://inrecord-preview-inrec.vercel.app/sitemap.xml | grep -o '<loc>[^<]*</loc>' | head -1
```
Expected: `<loc>https://inrecord-preview-inrec.vercel.app</loc>`（不再是 swart）

---

### Task 2: 正式站的 vercel.app 別名 301 到正式網域

**Files:**
- Modify: `next.config.js`（新增 `redirects()`）

**Interfaces:**
- Consumes: 無
- Produces: 對 `inrecord-swart.vercel.app`、`inrecord-inrecmusic-9815s-projects.vercel.app` 的請求 308 轉到 `https://inrecordmusic.com/<同路徑>`

**背景：** 這兩個別名指向同一個 production 部署，任何分享出去的 vercel.app 連結都會繞過以網域為單位的保護（Bunny 播放白名單、追蹤網域）。以「主機名精確比對」限定這兩個別名，preview 部署（`inrecord-<hash>-…` 與 `inrecord-preview-inrec`）不受影響。

- [ ] **Step 1: 加入 redirects 規則**

在 `next.config.js` 的 `nextConfig` 內、`async rewrites()` 之前加入：

```js
  // 正式部署的 vercel.app 別名與正式網域指向同一份部署；分享出去的 vercel.app 連結會繞過
  // 以網域為單位的保護（Bunny 播放白名單、追蹤網域），故一律導回正式網域。
  // 只比對這兩個「正式」別名，preview 的 inrecord-<hash>-… 與 inrecord-preview-inrec 不受影響。
  async redirects() {
    return ["inrecord-swart.vercel.app", "inrecord-inrecmusic-9815s-projects.vercel.app"].map((host) => ({
      source: "/:path*",
      has: [{ type: "host", value: host }],
      destination: "https://inrecordmusic.com/:path*",
      permanent: true,
    }));
  },
```

- [ ] **Step 2: 確認 build 通過**

Run: `npx next build`
Expected: 成功（redirects 設定寫錯會在 build 期直接報錯）

- [ ] **Step 3: Commit**

```bash
git add next.config.js
git commit -m "fix(seo): 正式站 vercel.app 別名導回 inrecordmusic.com"
```

- [ ] **Step 4: 上正式站後驗證（需使用者同意部署）**

```bash
curl -sI https://inrecord-swart.vercel.app/trial | grep -i '^location'
```
Expected: `location: https://inrecordmusic.com/trial`

---

### Task 3: 單元完成判定改以伺服器端影片長度為準

**Files:**
- Create: `lib/duration.js`
- Create: `lib/duration.test.js`
- Modify: `app/api/classroom/progress/route.js`
- Modify: `supabase-deploy.sql`（`upsert_progress` 函式）
- Test: `app/api/classroom/progress/route.test.js`（新建）

**Interfaces:**
- Consumes: `videos.duration`（既有 TEXT 欄位，後台新增單元時填，例 `12:40`）
- Produces: `parseDurationSeconds(text: string | null): number` — `"12:40"` → `760`；`"1:02:03"` → `3723`；無法解析或非正數 → `0`

**背景：** 完成判定用「這次呼叫送來的 `total_seconds`」算 70%：連送兩次 `total_seconds=1` 就能把任一單元刷成完成，進而取得結業證書。`videos.duration` 是後台既有欄位，足以當伺服器端權威長度，不需要新欄位或呼叫 Bunny API。

修法兩道，各自獨立生效：
1. **路由**：查出該影片（順便驗 `video_id` 是 UUID 且 `published`），能解析出長度就用它當 `p_total`，不採信前端。
2. **SQL**：完成門檻改用 `GREATEST(已存 total, 本次 total)`，讓沒填 duration 的單元也無法「事後把門檻調低」。

- [ ] **Step 1: 寫失敗的測試（純函式）**

Create `lib/duration.test.js`：

```js
import { describe, it, expect } from "vitest";
import { parseDurationSeconds } from "./duration.js";

describe("parseDurationSeconds（後台 duration 文字 → 秒）", () => {
  it("mm:ss", () => {
    expect(parseDurationSeconds("12:40")).toBe(760);
    expect(parseDurationSeconds("0:45")).toBe(45);
  });
  it("hh:mm:ss", () => {
    expect(parseDurationSeconds("1:02:03")).toBe(3723);
  });
  it("前後空白與全形冒號照樣解析", () => {
    expect(parseDurationSeconds("  12:40 ")).toBe(760);
    expect(parseDurationSeconds("12：40")).toBe(760);
  });
  it("純數字視為秒", () => {
    expect(parseDurationSeconds("600")).toBe(600);
  });
  it("解析不出來或非正數 → 0（呼叫端退回舊行為）", () => {
    for (const v of [null, undefined, "", "abc", "0:00", "-5", "12:99", {}, []]) {
      expect(parseDurationSeconds(v)).toBe(0);
    }
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/duration.test.js`
Expected: FAIL，`Failed to resolve import "./duration.js"`

- [ ] **Step 3: 寫最小實作**

Create `lib/duration.js`：

```js
// lib/duration.js — 後台 videos.duration（顯示用 TEXT，例 "12:40"）→ 秒數。
// 進度完成判定要有「伺服器端知道的影片長度」才不會被前端送來的假 total_seconds 騙；
// 這個欄位後台新增單元時就會填，不必再加欄位或呼叫 Bunny API。
// 解析不出來回 0，呼叫端據此退回原本採用前端值的行為。
export function parseDurationSeconds(text) {
  if (typeof text !== "string") return 0;
  const s = text.trim().replace(/：/g, ":");
  if (!/^\d+(:\d{1,2}){0,2}$/.test(s)) return 0;
  const parts = s.split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length > 1 && parts.slice(1).some((n) => n > 59)) return 0;
  const total = parts.reduce((acc, n) => acc * 60 + n, 0);
  return total > 0 ? total : 0;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/duration.test.js`
Expected: PASS

- [ ] **Step 5: 路由改用伺服器端長度，並驗 video_id**

在 `app/api/classroom/progress/route.js`：

import 區加入：

```js
import { parseDurationSeconds } from "@/lib/duration";
```

`accessCache` 那段之後加入影片長度快取（心跳每 10 秒一次，不快取會每次心跳多一次 DB 往返）：

```js
// 影片長度（伺服器端權威值）快取 5 分鐘。值為 { published, seconds }；查不到該影片記 null。
const videoCache = new Map(); // video_id -> { v, exp }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getVideoCached(admin, videoId) {
  const now = Date.now();
  const hit = videoCache.get(videoId);
  if (hit && hit.exp > now) return hit.v;
  const { data } = await admin.from("videos").select("published, duration").eq("id", videoId).maybeSingle();
  const v = data ? { published: !!data.published, seconds: parseDurationSeconds(data.duration) } : null;
  videoCache.set(videoId, { v, exp: now + 300_000 });
  if (videoCache.size > 500) {
    for (const [k, e] of videoCache) { if (e.exp <= now) videoCache.delete(k); }
  }
  return v;
}
```

POST 內「讀 body 到呼叫 RPC 之前」改成：

```js
  const { video_id, watched_seconds = 0, total_seconds = 0, viewed_delta = 0 } = await req.json();
  if (!video_id) return NextResponse.json({ error: "video_id_required" }, { status: 400 });
  // video_id 一律驗格式：非 UUID 會讓 PostgREST 丟 22P02 變成 500
  if (typeof video_id !== "string" || !UUID_RE.test(video_id)) {
    return NextResponse.json({ error: "invalid_video_id" }, { status: 400 });
  }
  const video = await getVideoCached(admin, video_id);
  if (!video || !video.published) return NextResponse.json({ error: "video_not_found" }, { status: 404 });

  const clientTotal = Math.max(0, Math.floor(Number(total_seconds) || 0));
  // 完成判定的分母一律以伺服器端知道的長度為準；後台沒填 duration 才退回前端值
  // （此時靠 RPC 的 GREATEST 保證門檻只會往上、不會被後來的小 total 調低）。
  const t = video.seconds || clientTotal;
  const wRaw = Math.max(0, Math.floor(Number(watched_seconds) || 0));
  const w = t > 0 ? Math.min(wRaw, t) : wRaw; // watched_seconds＝最遠播放位置（續播用）
```

`d`、`c`、RPC 呼叫與後備 upsert 維持原樣（它們都吃 `t`）。

- [ ] **Step 6: 寫路由測試**

Create `app/api/classroom/progress/route.test.js`。每個案例用**不同的 UUID**，避免共用模組層的 `videoCache` 互相污染。

```js
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1", email: "a@x.com" } }, error: null }) } }),
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/course-access", () => ({ hasCourseAccess: vi.fn(async () => true) }));
vi.mock("@/lib/rate-limit", () => ({ createDistributedLimiter: () => async () => ({ allowed: true }), clientIp: () => "1.1.1.1" }));

import { POST } from "./route";
import { getSupabaseAdmin } from "@/lib/supabase";

const uuid = (n) => `1111111${n}-2222-3333-4444-555555555555`;
const post = (body) => POST(new Request("http://x/api/classroom/progress", {
  method: "POST", headers: { authorization: "Bearer t", "content-type": "application/json" }, body: JSON.stringify(body),
}));

function makeDb(video) {
  const rpc = vi.fn(async () => ({ data: { completed: false }, error: null }));
  return { rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: video, error: null }) }) }) }) };
}

describe("POST /api/classroom/progress（完成判定的分母）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("以後台 duration 當分母：前端謊報 total_seconds=1 也不影響門檻", async () => {
    const db = makeDb({ published: true, duration: "10:00" });
    getSupabaseAdmin.mockReturnValue(db);
    await post({ video_id: uuid(1), watched_seconds: 1, total_seconds: 1, viewed_delta: 1 });
    expect(db.rpc.mock.calls[0][1].p_total).toBe(600);
  });

  it("後台沒填 duration → 退回前端值（由 SQL 的 GREATEST 保底）", async () => {
    const db = makeDb({ published: true, duration: null });
    getSupabaseAdmin.mockReturnValue(db);
    await post({ video_id: uuid(2), watched_seconds: 5, total_seconds: 300, viewed_delta: 10 });
    expect(db.rpc.mock.calls[0][1].p_total).toBe(300);
  });

  it("viewed_delta 仍夾在 15 秒", async () => {
    const db = makeDb({ published: true, duration: "10:00" });
    getSupabaseAdmin.mockReturnValue(db);
    await post({ video_id: uuid(3), watched_seconds: 1, total_seconds: 600, viewed_delta: 9999 });
    expect(db.rpc.mock.calls[0][1].p_viewed_delta).toBe(15);
  });

  it("未發布的單元 → 404，不寫進度", async () => {
    const db = makeDb({ published: false, duration: "10:00" });
    getSupabaseAdmin.mockReturnValue(db);
    expect((await post({ video_id: uuid(4), total_seconds: 600, viewed_delta: 10 })).status).toBe(404);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("video_id 非 UUID → 400，不查 DB", async () => {
    const db = makeDb({ published: true, duration: "10:00" });
    getSupabaseAdmin.mockReturnValue(db);
    expect((await post({ video_id: "'; drop--", total_seconds: 600 })).status).toBe(400);
    expect(db.rpc).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: 跑測試確認通過**

Run: `npx vitest run app/api/classroom/progress lib/duration`
Expected: PASS

- [ ] **Step 8: 更新 SQL（供使用者在正式 DB 執行）**

`supabase-deploy.sql` 的 `upsert_progress` 中，completed 那段改成同時考慮已存值：

```sql
    completed       = progress.completed OR EXCLUDED.completed
                      OR (GREATEST(progress.total_seconds, GREATEST(p_total,0)) > 0
                          AND progress.viewed_seconds + GREATEST(p_viewed_delta,0)
                              >= FLOOR(GREATEST(progress.total_seconds, GREATEST(p_total,0)) * 0.7)),
```

- [ ] **Step 9: Commit**

```bash
git add lib/duration.js lib/duration.test.js app/api/classroom/progress/route.js app/api/classroom/progress/route.test.js supabase-deploy.sql
git commit -m "fix(classroom): 單元完成判定改以後台影片長度為準，前端無法謊報 total_seconds 刷完成"
```

- [ ] **Step 10: 把 SQL 交給使用者**

把完整的 `CREATE OR REPLACE FUNCTION public.upsert_progress(...)` 片段貼給使用者，請他在 Supabase SQL Editor 執行。**程式碼在 SQL 未執行前已可獨立生效**（有填 duration 的單元即受保護）。

---

### Task 4: 結帳確認的金額若與後端實收不符就退回重新確認

**Files:**
- Modify: `app/api/payuni/checkout/route.js`（成功回應多帶 `amount`）
- Modify: `components/BuyModal.jsx`（比對後才導去 PAYUNi）
- Test: `components/BuyModal.amount.test.jsx`（新建）

**Interfaces:**
- Consumes: 無
- Produces: `POST /api/payuni/checkout` 成功回應多一個欄位 `amount: number`（後端實際建單金額）

**背景：** 首頁價格是 60 秒 ISR 快照再加上分頁開著的時間；波段 23:59 結束、使用者 00:05 按「確認購買」，畫面顯示舊價、PAYUNi 收新價，而條款寫契約在按下那一刻成立。

- [ ] **Step 1: 後端回傳 amount**

`app/api/payuni/checkout/route.js` 的成功回應改成：

```js
    return NextResponse.json({
      url: payuniUrl,
      // 後端實際建單金額：前端據此與畫面上剛確認的金額比對，不符就退回重新確認（避免波段換價的瞬間收錯價）
      amount: Number(price),
      fields: { MerID: merID, Version: "1.0", EncryptInfo: encryptInfo, HashInfo: hashInfo },
    });
```

- [ ] **Step 2: 前端比對**

`components/BuyModal.jsx` 的 `handleCheckout`，在 `if (!res.ok) throw new Error(...)` 之後、建立 form 之前插入：

```js
      // 後端才是價格權威：畫面價格來自首頁 60 秒快照，波段剛換價時兩者會不一致。
      // 不一致就退回第一步讓消費者重新確認，不要默默用新價收款。
      const shown = Number(couponApplied?.finalPrice ?? basePrice);
      if (Number.isFinite(data.amount) && data.amount !== shown) {
        setStep(1);
        setError(`⚠️ 優惠價格已更新為 NT$${Number(data.amount).toLocaleString("en-US")}，請重新確認後再送出。`);
        setLoading(false);
        return;
      }
```

- [ ] **Step 3: 寫測試**

先讀 `components/BuyModal.consent.test.jsx`，沿用它的 render／mock 與「走到第二步並勾選同意後送出」的操作方式，建立 `components/BuyModal.amount.test.jsx`，兩個案例：

1. 後端 `amount` 與畫面一致 → 有建立 `form.action === "https://pay.test"` 並送出。
2. 後端 `amount` 不同（例 5800）→ 畫面出現「價格已更新為 NT$5,800」、回到第一步、**沒有**建立導向 PAYUNi 的 form。

不可留下 `expect(true).toBe(true)` 這類佔位斷言。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run components/BuyModal`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/payuni/checkout/route.js components/BuyModal.jsx components/BuyModal.amount.test.jsx
git commit -m "fix(checkout): 後端回傳實收金額，與確認畫面不符就退回重新確認"
```

---

### Task 5: ATM／超商取號不得顯示成付款成功、不得觸發轉換追蹤

**Files:**
- Modify: `app/success/page.jsx`
- Test: `app/success/page.test.jsx`（新建）

**Interfaces:**
- Consumes: `orders.status`（`pending` / `paid` / `refunded`）
- Produces: `/success` 三態畫面：`paid` → 成功、`?status=failed` → 失敗、其餘（含 ATM 取號後的 `pending`）→「已取得繳費資訊」

**背景：** 導回頁把「外層 `Status=SUCCESS`」也視為付款成功，而 `notify` 只認 `TradeStatus=1`。取號的人會看到「預購成功」，廣告平台也會記到一筆沒收到錢的轉換。

**設計取捨：** 不去猜 PAYUNi 對 ATM 導回的欄位語意（無法從程式碼驗證），改以**訂單狀態**為準——`orders.status` 由 `notify` 寫入，只有真的收到款才會是 `paid`，這是站內最可靠的事實。

- [ ] **Step 1: 以訂單狀態決定畫面**

`app/success/page.jsx` 讀訂單那段改為：

```js
  let purchase = null;
  let orderExists = false;
  let orderPaid = false;
  let orderEmail = "";
  if (tradeNo && !failed) {
    try {
      const sb = getSupabaseAdmin();
      const { data: order } = sb
        ? await sb.from("orders").select("amount, plan, status, email").eq("mer_trade_no", tradeNo).maybeSingle()
        : { data: null };
      if (order) {
        orderExists = true;
        orderPaid = order.status === "paid";
        if (fromPayuni) orderEmail = order.email || ""; // 沒憑證就不預填（等於不外洩買家信箱）
        // 轉換追蹤只在真的收到款時觸發：ATM／超商「取號成功」也會導回這一頁，
        // 此時訂單還是 pending，打 Purchase 會讓廣告平台記到一筆沒收到錢的轉換。
        if (orderPaid) {
          const platforms = await getTrackingSettings();
          purchase = {
            transactionId: tradeNo,
            value: Number(order.amount) || 0,
            contentIds: [order.plan],
            googleAdsSendTo: platforms?.googleAds?.purchaseLabel ? `${platforms.googleAds.id}/${platforms.googleAds.purchaseLabel}` : null,
            lineTagId: platforms?.line?.id || null,
          };
        }
      }
    } catch {}
  }

  // ATM／超商取號：導回時訂單仍是 pending（notify 只在 TradeStatus=1 才寫 paid）。
  // 這種情況不能說「購買成功」，改顯示待繳費說明；查不到訂單時維持原本的成功畫面（保守，不嚇到真的付款成功的人）。
  const awaitingPayment = orderExists && !orderPaid;
```

- [ ] **Step 2: 待繳費畫面**

在 `if (failed) { ... }` 區塊之後、`const heading = ...` 之前插入：

```js
  if (awaitingPayment) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "linear-gradient(135deg,#fffbeb,#eff6ff)" }}>
        <div style={card}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🧾</div>
          <Logo size={28} />
          <h1 style={{ fontSize: 30, letterSpacing: "-.04em", margin: "16px 0 10px", wordBreak: "keep-all", lineBreak: "strict" }}>已取得繳費資訊</h1>
          <p style={{ color: "#64748b", margin: "0 0 8px", lineHeight: 1.8, wordBreak: "keep-all", lineBreak: "strict" }}>這筆訂單還沒完成付款。請依付款方式提供的帳號或代碼，在期限內完成繳費。</p>
          <p style={{ color: "#64748b", marginBottom: 24, wordBreak: "keep-all", lineBreak: "strict" }}>繳費完成後我們會收到通知，並以 Email 與你確認。</p>
          {tradeNo && <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 24 }}>訂單編號：{tradeNo}</p>}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <a href="/" style={primaryBtn}>回到首頁</a>
            <a href="/contact" style={ghostBtn}>聯絡我們</a>
          </div>
        </div>
      </div>
    );
  }
```

- [ ] **Step 3: 寫測試**

Create `app/success/page.test.jsx`（node 環境：直接 `await SuccessPage({ searchParams })` 取回 React 元素樹再以 `JSON.stringify` 或遞迴搜尋檢查，參考 `app/classroom/page.hero.test.jsx` 的作法）。需 mock `next/headers`、`@/lib/supabase`、`@/lib/sale`、`@/lib/tracking`、`@/lib/order-fulfillment`。案例：

1. 訂單 `status="paid"` → 標題含「成功」、樹中有 `PurchaseTracking`。
2. 訂單 `status="pending"` → 標題含「已取得繳費資訊」、**沒有** `PurchaseTracking`。
3. 訂單 `status="refunded"` → 走待繳費畫面、無追蹤。
4. 查無訂單 → 維持原本成功畫面（保守）。
5. `?status=failed` → 失敗畫面（「付款未完成」）。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run app/success`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/success/page.jsx app/success/page.test.jsx
git commit -m "fix(success): 未收款的訂單不顯示購買成功、不觸發轉換追蹤"
```

---

### Task 6: 結業證書印真實姓名；資格暫不看測驗

**Files:**
- Modify: `lib/certificate.js`
- Modify: `lib/certificate.test.js`
- Modify: `app/api/classroom/certificate/route.js`
- Modify: `app/classroom/certificate/page.jsx:72`

**Interfaces:**
- Consumes: `student_profiles.real_name`（PK `user_id`）
- Produces: `certificateStatus()` 的 `eligible` 只看影片；`quizDone` / `quizTotal` 仍回傳供顯示

**背景：** 證書印 `user_metadata.full_name` 或 email 前綴（暱稱／`alan52jay`），但報名引導已強制填 `student_profiles.real_name`。另外資格要求「通過所有已發布測驗」，而學員端沒有作答介面（quiz API 只有後台在用）——只要發布任何一份測驗，全體學員永遠拿不到證書。

- [ ] **Step 1: 改測試（先讓它失敗）**

`lib/certificate.test.js` 第 19–24 行那個案例改為：

```js
  it("學員端尚無測驗介面，資格暫不看測驗：缺測驗仍可發證（數字照回報）", () => {
    expect(certificateStatus({
      publishedVideoIds: ["v1"], completedVideoIds: ["v1"],
      publishedQuizIds: ["q1", "q2"], passedQuizIds: ["q1"],
    })).toEqual({ eligible: true, videoDone: 1, videoTotal: 1, quizDone: 1, quizTotal: 2 });
  });
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/certificate.test.js`
Expected: FAIL（`eligible` 實得 `false`）

- [ ] **Step 3: 改 lib**

`lib/certificate.js` 的 `eligible` 那行改成：

```js
  // ⚠️ 資格暫不看測驗：學員端沒有作答介面（quiz API 目前只有後台在用），
  // 只要後台發布任何一份測驗，全體學員就永遠拿不到證書。等學員端測驗上線再把 quizDone === quizTotal 加回來。
  const eligible = videoTotal > 0 && videoDone === videoTotal;
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/certificate.test.js`
Expected: PASS

- [ ] **Step 5: 證書姓名改讀真實姓名**

`app/api/classroom/certificate/route.js` 的 `const name = ...` 改成：

```js
  // 證書要印報名時填的真實姓名；student_profiles.real_name 是引導流程的必填欄位。
  // 查不到才退回顯示名稱／email 前綴（舊資料或尚未完成引導者）。
  const { data: profile } = await supabase
    .from("student_profiles").select("real_name").eq("user_id", user.id).maybeSingle();
  const name = (profile?.real_name || "").trim()
    || user.user_metadata?.full_name || user.email?.split("@")[0] || "學員";
```

⚠️ 這行必須放在「已發證直接回傳」那段**之前**，否則已發證的學員仍會拿到舊的暱稱。

- [ ] **Step 6: 資格畫面不再把測驗講成門檻**

`app/classroom/certificate/page.jsx:72` 的測驗那列改為中性顯示：

```jsx
            <span style={{ color: "#64748b", fontWeight: 600 }}>已通過 {state.quizDone}/{state.quizTotal}</span>
```

同時確認該列附近沒有「需全部通過才能領證」之類的文字；若有，改成「（測驗僅供自我檢核）」。

- [ ] **Step 7: 全套測試 + lint**

Run: `npx vitest run && npx next lint`
Expected: 全綠、無新警告

- [ ] **Step 8: Commit**

```bash
git add lib/certificate.js lib/certificate.test.js app/api/classroom/certificate/route.js app/classroom/certificate/page.jsx
git commit -m "fix(certificate): 證書改印報名真實姓名；資格暫不看測驗（學員端尚無作答介面）"
```

---

## 收尾

- [ ] `npx vitest run` 全綠、`npx next lint` 無新警告、`npx next build` 通過
- [ ] `npx vercel deploy --yes` → preview，把網址交給使用者確認
- [ ] Task 3 的 SQL 交給使用者在正式 DB 執行
- [ ] 使用者確認後才 `npx vercel --prod`
