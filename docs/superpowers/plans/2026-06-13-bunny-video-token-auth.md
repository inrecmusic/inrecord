# 影片防下載強化 — Bunny Embed Token 驗證 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 classroom 課程影片的 Bunny embed 從公開 URL 改為伺服器端簽發、帶到期時間的 Embed View Token，並在簽發前驗證使用者已購買。

**Architecture:** 純函式 `lib/bunny.js` 負責簽 URL（`SHA256_HEX(tokenKey+videoId+expires)`）；新路由 `/api/classroom/video-embed` 驗 Supabase JWT + 查 enrollment 後呼叫簽函式回傳 src；client 端教室頁的 Bunny 分支改為向此路由索取 src。Vimeo legacy 分支與其進度追蹤完全不動。缺 `BUNNY_TOKEN_KEY` 時回未簽 URL（平滑切換）。

**Tech Stack:** Next.js 14 App Router、`@supabase/supabase-js`、Node `crypto`、Vitest。

---

## 設計依據（spec）
`docs/superpowers/specs/2026-06-13-bunny-video-token-auth-design.md`

## 檔案結構
- 建立 `lib/bunny.js` — 簽 URL 純函式（唯一職責：產生 embed URL）
- 建立 `lib/bunny.test.js` — 純函式單元測試
- 建立 `app/api/classroom/video-embed/route.js` — 簽發路由（驗身分+購買→簽發）
- 修改 `app/classroom/page.jsx` — Bunny 分支改向後端索取 src（Vimeo 分支不動）
- 修改 `.env.local.example` — 補 `BUNNY_TOKEN_KEY`
- 修改 `CLAUDE.md` — env 清單 + 影片防護一句說明

> 路由處理器比照本專案既有慣例（`verify-purchase`/`games` 等路由不寫單元測試，邏輯抽到有測試的 lib/），靠 `lib/bunny.test.js` + build + 手動驗證把關。

---

### Task 1: `lib/bunny.js` 簽 URL 純函式（TDD）

**Files:**
- Create: `lib/bunny.js`
- Test: `lib/bunny.test.js`

- [ ] **Step 1: 寫失敗測試**

Create `lib/bunny.test.js`:

```js
import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { signBunnyEmbedUrl } from "./bunny.js";

const LIB = "12345";
const KEY = "secret-token-key";
const VID = "abc-def-123";

describe("signBunnyEmbedUrl", () => {
  it("有金鑰：產生帶 token+expires 的簽名 URL，雜湊正確", () => {
    const now = 1_700_000_000_000; // 固定毫秒，便於斷言
    const url = signBunnyEmbedUrl(VID, { libraryId: LIB, tokenKey: KEY, expiresInSec: 10800, now });
    const expires = Math.floor(now / 1000) + 10800;
    const expectToken = crypto.createHash("sha256").update(KEY + VID + expires).digest("hex");
    expect(url).toContain(`/embed/${LIB}/${VID}`);
    expect(url).toContain(`token=${expectToken}`);
    expect(url).toContain(`expires=${expires}`);
    expect(expectToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it("expires = floor(now/1000) + expiresInSec", () => {
    const now = 1_700_000_500_000;
    const url = signBunnyEmbedUrl(VID, { libraryId: LIB, tokenKey: KEY, expiresInSec: 60, now });
    expect(new URL(url).searchParams.get("expires")).toBe(String(Math.floor(now / 1000) + 60));
  });

  it("無金鑰：回傳未簽名 URL（不含 token/expires）", () => {
    const url = signBunnyEmbedUrl(VID, { libraryId: LIB, tokenKey: "", now: 1 });
    expect(url).toBe(`https://iframe.mediadelivery.net/embed/${LIB}/${VID}?autoplay=false&loop=false&muted=false&preload=true`);
    expect(url).not.toContain("token=");
    expect(url).not.toContain("expires=");
  });

  it("附加預設播放參數", () => {
    const url = signBunnyEmbedUrl(VID, { libraryId: LIB, tokenKey: KEY, now: 1 });
    expect(url).toContain("autoplay=false");
    expect(url).toContain("preload=true");
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/bunny.test.js`
Expected: FAIL（`signBunnyEmbedUrl` 尚未定義 / 無法 import）

- [ ] **Step 3: 寫最小實作**

Create `lib/bunny.js`:

```js
import crypto from "crypto";

// Bunny Stream Embed View Token URL 簽發。
// token = SHA256_HEX(tokenKey + videoId + expires)，expires 為 UNIX 秒。
// 額外播放參數不納入雜湊（符合 Bunny 規格）。
// 無 tokenKey → 回傳未簽名 URL（向後相容：程式可先上線，待 Bunny 後台開啟
// token 驗證 + 設好 env 後自動生效）。
const EMBED_BASE = "https://iframe.mediadelivery.net/embed";
const DEFAULT_PLAYER_PARAMS = "autoplay=false&loop=false&muted=false&preload=true";

export function signBunnyEmbedUrl(videoId, {
  libraryId,
  tokenKey,
  expiresInSec = 10800, // 3 小時
  now = Date.now(),
  playerParams = DEFAULT_PLAYER_PARAMS,
} = {}) {
  const base = `${EMBED_BASE}/${libraryId}/${videoId}`;
  if (!tokenKey) return `${base}?${playerParams}`;

  const expires = Math.floor(now / 1000) + expiresInSec;
  const token = crypto
    .createHash("sha256")
    .update(tokenKey + videoId + expires)
    .digest("hex");
  return `${base}?token=${token}&expires=${expires}&${playerParams}`;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/bunny.test.js`
Expected: PASS（4 案）

- [ ] **Step 5: Commit**

```bash
git add lib/bunny.js lib/bunny.test.js
git commit -m "feat(bunny): Embed View Token 簽 URL 純函式 + 單元測試"
```

---

### Task 2: `/api/classroom/video-embed` 簽發路由

**Files:**
- Create: `app/api/classroom/video-embed/route.js`

- [ ] **Step 1: 寫路由**

Create `app/api/classroom/video-embed/route.js`:

```js
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { signBunnyEmbedUrl } from "@/lib/bunny";

function getUserClient(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

// 簽發課程影片 embed URL：驗登入 + 已購買後，回傳帶 token 的 Bunny 安全 URL。
export async function GET(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await getUserClient(token).auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  // 伺服器端購買驗證（補上 embed 原本缺的權限把關）
  const { data: enroll } = await supabase
    .from("enrollments")
    .select("id")
    .eq("email", user.email)
    .eq("course_id", "piano-101")
    .maybeSingle();
  if (!enroll) return NextResponse.json({ error: "purchase_required" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("video_id");
  if (!videoId) return NextResponse.json({ error: "missing_video_id" }, { status: 400 });

  const { data: video } = await supabase
    .from("videos")
    .select("bunny_video_id, vimeo_id")
    .eq("id", videoId)
    .maybeSingle();
  if (!video) return NextResponse.json({ error: "video_not_found" }, { status: 404 });

  if (video.bunny_video_id) {
    const src = signBunnyEmbedUrl(video.bunny_video_id, {
      libraryId: process.env.NEXT_PUBLIC_BUNNY_LIBRARY_ID,
      tokenKey:  process.env.BUNNY_TOKEN_KEY,
      expiresInSec: 10800,
    });
    return NextResponse.json({ provider: "bunny", src });
  }
  if (video.vimeo_id) {
    return NextResponse.json({
      provider: "vimeo",
      src: `https://player.vimeo.com/video/${video.vimeo_id}?autoplay=0&title=0&byline=0&portrait=0`,
    });
  }
  return NextResponse.json({ error: "no_video_source" }, { status: 404 });
}
```

- [ ] **Step 2: build 驗證可編譯且路由出現**

Run: `npm run build 2>&1 | grep "video-embed"`
Expected: 看到 `ƒ /api/classroom/video-embed`（無編譯錯誤）

- [ ] **Step 3: Commit**

```bash
git add app/api/classroom/video-embed/route.js
git commit -m "feat(api): /classroom/video-embed 驗購買後簽發 Bunny 安全 URL"
```

---

### Task 3: 教室頁 Bunny 分支改走後端簽名

**Files:**
- Modify: `app/classroom/page.jsx`（主元件：`token` state ~line 499、`currentVideo` state ~line 507、Player 區 `currentVideo?.bunny_video_id ?` ternary ~line 795）

- [ ] **Step 1: 新增 embed state**

在 `currentVideo` state 宣告（`const [currentVideo, setCurrentVideo] = useState(null);`）下一行新增：

```jsx
  const [embedSrc, setEmbedSrc] = useState("");
```

- [ ] **Step 2: 新增取簽名 src 的 effect**

在既有的「vimeo 進度追蹤」effect（`}, [currentVideo?.id, token]);` 那一段）**之後**新增一個 effect：

```jsx
  // Bunny 影片：切換時向後端索取帶 token 的簽名 embed URL（Vimeo 不走此路徑）
  useEffect(() => {
    setEmbedSrc("");
    const vid = currentVideo?.id;
    if (!vid || !token || !currentVideo?.bunny_video_id) return;
    fetch(`/api/classroom/video-embed?video_id=${vid}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (data?.src) setEmbedSrc(data.src); })
      .catch(() => {});
  }, [currentVideo?.id, token]);
```

- [ ] **Step 3: 改 Player 的 Bunny 分支用 embedSrc**

把 Player 區開頭的 Bunny 分支（原本）：

```jsx
            {currentVideo?.bunny_video_id ? (
              <div style={{ paddingTop: "44%", position: "relative" }}>
                <iframe
                  src={`https://iframe.mediadelivery.net/embed/${process.env.NEXT_PUBLIC_BUNNY_LIBRARY_ID}/${currentVideo.bunny_video_id}?autoplay=false&loop=false&muted=false&preload=true`}
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
                  allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : currentVideo?.vimeo_id ? (
```

替換為（只動 Bunny 分支；`: currentVideo?.vimeo_id ? (` 之後完全不變）：

```jsx
            {currentVideo?.bunny_video_id ? (
              <div style={{ paddingTop: "44%", position: "relative", background: "#000" }}>
                {embedSrc ? (
                  <iframe
                    src={embedSrc}
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
                    allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8" }}>
                    載入影片中…
                  </div>
                )}
              </div>
            ) : currentVideo?.vimeo_id ? (
```

- [ ] **Step 4: build 驗證**

Run: `npm run build 2>&1 | tail -5`
Expected: `✓ Compiled successfully`（無錯誤）

- [ ] **Step 5: Commit**

```bash
git add app/classroom/page.jsx
git commit -m "feat(classroom): Bunny 影片改向後端索取簽名 embed URL（Vimeo 不變）"
```

---

### Task 4: env 範本 + CLAUDE.md + 全量驗證

**Files:**
- Modify: `.env.local.example`
- Modify: `CLAUDE.md`

- [ ] **Step 1: 補 `.env.local.example`**

把 Bunny 區（`# ── Bunny Stream（影片播放）──` 區塊）改為：

```
# ── Bunny Stream（影片播放）──
# 教室影片以 iframe.mediadelivery.net 嵌入，需 Library ID
NEXT_PUBLIC_BUNNY_LIBRARY_ID=你的BunnyLibraryID
# 影片防盜連：函式庫 Security 的 Token Authentication Key（伺服器專用，勿用 NEXT_PUBLIC_）
# 留空＝不簽名（須同時關閉 Bunny 後台 Token Authentication，否則影片會 403）
BUNNY_TOKEN_KEY=你的BunnyTokenAuthKey
```

- [ ] **Step 2: 補 `CLAUDE.md`**

在「環境變數」區塊的 Bunny 相關行附近加入 `BUNNY_TOKEN_KEY`，並在「遊戲防盜保護」段落之後或「主要 API 路由」表格加入一行說明：

於環境變數清單（`KV_REST_API_TOKEN` 之前的 Bunny 相關處，若無則在清單末尾）加入：
```
BUNNY_TOKEN_KEY
```

於主要 API 路由表格新增一列：
```
| `/api/classroom/video-embed` | GET | 驗購買後簽發 Bunny 安全 embed URL（token+expires） |
```

並在「遊戲防盜保護」段落後新增一句：
```
### 影片防盜保護（Bunny）
- 課程影片 embed URL 由 `/api/classroom/video-embed` 伺服器端簽發 Bunny Embed View Token（`SHA256_HEX(BUNNY_TOKEN_KEY + bunny_video_id + expires)`，預設 3h 到期），簽發前驗 Supabase JWT + enrollment。`lib/bunny.js` 為純函式（有測試）。缺 `BUNNY_TOKEN_KEY` 時回未簽 URL（平滑切換）。Vimeo legacy 維持未簽。
- 👤 上線需於 Bunny 後台開啟該函式庫 **Token Authentication** 並設定 **Allowed Referrers** 為正式網域。
```

- [ ] **Step 3: 全量測試 + build**

Run: `npm test && npm run build 2>&1 | tail -5`
Expected: 測試全數 PASS（含新增 4 案）、`✓ Compiled successfully`

- [ ] **Step 4: Commit**

```bash
git add .env.local.example CLAUDE.md
git commit -m "docs: 補 BUNNY_TOKEN_KEY 與影片防護說明（env 範本 + CLAUDE.md）"
```

---

## 部署與外部設定（👤，實作後）
- Vercel Production env 新增 `BUNNY_TOKEN_KEY`（先確認 `vercel whoami` 為 inrecmusic 帳號）
- Bunny 後台：該 Stream 函式庫開啟 **Token Authentication**、**Allowed Referrers** 設正式網域（本機開發需另加 localhost 或暫不設 referer）
- 部署：`npx vercel --prod`（本專案 Vercel 未連動 GitHub）
- 驗證順序：先部署程式（缺金鑰 → 未簽 URL，照常播放）→ 設好 env + 開 Bunny token 驗證 → 確認簽名 URL 可播、且直接複製舊公開 URL 會 403

## Self-Review 結果
- **Spec coverage**：lib 簽函式（Task 1）、簽發路由+購買驗證（Task 2）、client 串接（Task 3）、env/文件/後台步驟（Task 4 + 部署段）全覆蓋。
- **Placeholder scan**：無 TBD/TODO；每個 code step 均含完整程式碼。
- **Type/命名一致**：`signBunnyEmbedUrl(videoId, opts)` 在 Task 1 定義、Task 2 同簽名呼叫；回傳 `{ provider, src }` 與 Task 3 取用的 `data.src` 一致；state `embedSrc` 命名一致。
