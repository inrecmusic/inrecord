# 互動遊戲存取安全強化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 確保付費互動遊戲一定要登入＋購買才能玩、防分享網址；加裝置上限擋帳號共享、強化浮水印與不快取。

**Architecture:** games API（`app/api/classroom/games`）在既有 JWT＋subscriptions 驗證後，對 `html` 類型單一遊戲新增裝置上限檢查（新 `game_devices` 表＋純函式 `pickAllowedDeviceIds`）；浮水印改用純函式 `buildWatermark`（含日期）＋回應 `no-store`。前端 `GamesTab` 產生 `device_id`（localStorage）帶進請求、處理 403、url 遊戲掛「試玩」標籤。後台 `GamesManagePage` 加 url 公開試玩提示＋裝置上限設定（新 `game_settings` 表＋admin API）。

**Tech Stack:** Next.js 14 App Router、Supabase（service-role admin client `getSupabaseAdmin`）、vitest。

## Global Constraints
- 付費遊戲一律 `game_type='html'`；`url`＝公開試玩（**不套**裝置上限/浮水印，可自由分享）。
- 裝置上限預設 **3**、存 `game_settings.device_limit`、後台可調；超限回 `403 { error:"device_limit", limit }`。
- `device_id` 由前端 localStorage 產生（key `inrec_device_id`，用 `crypto.randomUUID()`），經 query param `device_id` 傳給 games API。
- `user_id`/`email` 一律取自 JWT（`auth.getUser`），**不信前端**。
- 裝置上限與浮水印**只作用於 `game_type='html'` 的單一遊戲取用**；list 與 url 類型不套。
- 新表 service_role RLS、idempotent SQL、部署序在 `supabase-hardening.sql` **之前**。
- 純函式零外部 import；測試用 vitest **node 環境**（勿加 jsdom docblock）。
- 每個 commit 只 stage 該 task 明確路徑（**不 `git add -A`**、不 push；本 repo 另有 parallel session）。

---

### Task 1: `game_devices` ＋ `game_settings` 表

**Files:**
- Create: `supabase-game-security.sql`
- Modify: `CLAUDE.md`（「部署需執行的 SQL」段，插在 `supabase-capi.sql`／`supabase-student-profiles.sql` 之後、`supabase-hardening.sql` 之前）

**Interfaces:**
- Produces: `game_devices`（PK `(user_id, device_id)`、`last_seen_at`）、`game_settings`（單列 `id='default'`、`device_limit` 預設 3）。Task 3 讀寫。

- [ ] **Step 1: 建 `supabase-game-security.sql`**

```sql
-- 互動遊戲存取安全：裝置上限（game_devices）＋設定（game_settings）
CREATE TABLE IF NOT EXISTS game_devices (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id    TEXT NOT NULL,
  user_agent   TEXT,
  ip           TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, device_id)
);
CREATE INDEX IF NOT EXISTS game_devices_user_lastseen_idx
  ON game_devices (user_id, last_seen_at DESC);
ALTER TABLE game_devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_game_devices" ON game_devices;
CREATE POLICY "service_role_game_devices" ON game_devices
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS game_settings (
  id           TEXT PRIMARY KEY DEFAULT 'default',
  device_limit INT NOT NULL DEFAULT 3,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO game_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;
ALTER TABLE game_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_game_settings" ON game_settings;
CREATE POLICY "service_role_game_settings" ON game_settings
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
```

- [ ] **Step 2: 更新 `CLAUDE.md` 部署順序** — 在 `supabase-student-profiles.sql`（…idempotent）之後、`supabase-hardening.sql` 之前補一段：`→ **supabase-game-security.sql**（互動遊戲安全：game_devices／game_settings 表，自帶 RLS service_role policy，idempotent）`。

- [ ] **Step 3: Commit**（不執行 DB — controller 事後在正式 DB 執行）

```bash
git add supabase-game-security.sql CLAUDE.md
git commit -m "feat: game_devices／game_settings 表（裝置上限）＋部署順序"
```

---

### Task 2: `lib/game-devices.js` 純函式（TDD）

**Files:**
- Create: `lib/game-devices.js`
- Test: `lib/game-devices.test.js`

**Interfaces:**
- Produces：
  - `pickAllowedDeviceIds(devices, limit)` → `string[]`：devices=`[{device_id, last_seen_at}]`，依 `last_seen_at` 新→舊取前 `limit` 個 `device_id`。
  - `buildWatermark(email, dateStr)` → `string`：回傳注入 `</body>` 前的多處浮水印 HTML（含 email 與 dateStr）。
- Task 3 games API 依賴這兩個函式。

- [ ] **Step 1: 寫失敗測試** `lib/game-devices.test.js`

```js
import { describe, it, expect } from "vitest";
import { pickAllowedDeviceIds, buildWatermark } from "./game-devices";

describe("pickAllowedDeviceIds", () => {
  const d = (id, t) => ({ device_id: id, last_seen_at: t });
  it("裝置數 ≤ limit：全部允許", () => {
    const out = pickAllowedDeviceIds([d("a","2026-08-01"), d("b","2026-08-02")], 3);
    expect(out.sort()).toEqual(["a","b"]);
  });
  it("裝置數 > limit：只留最新 N（依 last_seen_at）", () => {
    const out = pickAllowedDeviceIds(
      [d("old","2026-08-01"), d("mid","2026-08-05"), d("new","2026-08-10"), d("older","2026-07-01")], 2);
    expect(out).toEqual(["new","mid"]);
  });
  it("空陣列 → 空", () => {
    expect(pickAllowedDeviceIds([], 3)).toEqual([]);
  });
});

describe("buildWatermark", () => {
  it("含 email 與日期、且為多處（≥2 個 div）", () => {
    const html = buildWatermark("a@x.com", "2026-08-12");
    expect(html).toContain("a@x.com");
    expect(html).toContain("2026-08-12");
    expect((html.match(/<div/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗** `npx vitest run lib/game-devices.test.js` → FAIL（Cannot find module）。

- [ ] **Step 3: 實作** `lib/game-devices.js`

```js
// 依 last_seen_at 新→舊取前 limit 個 device_id（允許集）
export function pickAllowedDeviceIds(devices, limit) {
  return [...devices]
    .sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at))
    .slice(0, limit)
    .map(d => d.device_id);
}

// 多處分散＋含日期的浮水印（注入 </body> 前）；opacity 極低不影響遊玩
export function buildWatermark(email, dateStr) {
  const wm = `${email} · ${dateStr} · InRecord`;
  const base = "position:fixed;opacity:0.06;color:#fff;font-size:14px;pointer-events:none;z-index:9999;white-space:nowrap;user-select:none";
  return (
    `<div style="${base};top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg)">${wm}</div>` +
    `<div style="${base};top:12%;left:64%;transform:rotate(-30deg)">${wm}</div>` +
    `<div style="${base};top:84%;left:10%;transform:rotate(-30deg)">${wm}</div>`
  );
}
```

- [ ] **Step 4: 跑測試確認通過** `npx vitest run lib/game-devices.test.js` → PASS（4/4）。

- [ ] **Step 5: Commit**

```bash
git add lib/game-devices.js lib/game-devices.test.js
git commit -m "feat: lib/game-devices 純函式（裝置允許集＋浮水印）"
```

---

### Task 3: games API 裝置上限＋no-store＋浮水印

**Files:**
- Modify: `app/api/classroom/games/route.js`（single game 分支，現況 `if (gameId){…}` 約 39–70）

**Interfaces:**
- Consumes: `pickAllowedDeviceIds(devices, limit)`／`buildWatermark(email, dateStr)`（Task 2）；`game_devices`／`game_settings`（Task 1）。
- Produces: 對 `html` 單一遊戲多一個 `403 { error:"device_limit", limit }`（Task 4 前端處理）；缺 device_id 回 `400 { error:"device_required" }`。

- [ ] **Step 1: 頂部 import** — 在 `import { getSupabaseAdmin } from "@/lib/supabase";` 下一行加：

```js
import { pickAllowedDeviceIds, buildWatermark } from "@/lib/game-devices";
```

- [ ] **Step 2: 改造 single game 分支** — 把現況整段 `if (gameId) { … }`（單一遊戲，含既有 url 分支、浮水印、防嵌入、回傳）**整段替換**為：

```js
  /* ── single game (with content) ── */
  if (gameId) {
    const { data: game, error } = await supabase
      .from("games").select("*").eq("id", gameId).single();

    if (error || !game || game.is_active === false)
      return NextResponse.json({ error: "game_not_found" }, { status: 404 });

    // url 類型＝公開試玩：不套裝置上限/浮水印
    if (game.game_type === "url") {
      return NextResponse.json({ game: { ...game, html_content: null } });
    }

    // ── 裝置上限（只對 html 付費遊戲）──
    const deviceId = searchParams.get("device_id");
    if (!deviceId) return NextResponse.json({ error: "device_required" }, { status: 400 });
    const ua = req.headers.get("user-agent") || null;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const nowIso = new Date().toISOString();
    await supabase.from("game_devices").upsert(
      { user_id: user.id, device_id: deviceId, user_agent: ua, ip, last_seen_at: nowIso },
      { onConflict: "user_id,device_id" }
    );
    const { data: settings } = await supabase
      .from("game_settings").select("device_limit").eq("id", "default").single();
    const limit = settings?.device_limit ?? 3;
    const { data: devices } = await supabase
      .from("game_devices").select("device_id, last_seen_at").eq("user_id", user.id);
    const allowed = pickAllowedDeviceIds(devices || [], limit);
    if (!allowed.includes(deviceId))
      return NextResponse.json({ error: "device_limit", limit }, { status: 403 });

    // 浮水印（含日期）＋防嵌入
    const siteHost = process.env.NEXT_PUBLIC_SITE_URL
      ? new URL(process.env.NEXT_PUBLIC_SITE_URL).hostname
      : "inrecordmusic.com";
    let html = (game.html_content || "").replace(
      "</body>", `${buildWatermark(user.email, nowIso.slice(0, 10))}</body>`
    );
    html = html.replace(
      "<head>",
      `<head><script>if(window.top!==window.self&&!document.referrer.includes('${siteHost}')){document.body.innerHTML='⛔ 未授權存取';}</script>`
    );

    // no-store：html 內容不落瀏覽器快取
    return new NextResponse(
      JSON.stringify({ game: { ...game, html_content: html } }),
      { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
    );
  }
```

- [ ] **Step 3: build 驗證** `cd ~/code/inrecord && npx next build 2>&1 | tail -12` → 綠、`/api/classroom/games` 在路由表。

- [ ] **Step 4: Commit**

```bash
git add app/api/classroom/games/route.js
git commit -m "feat: 遊戲 API 裝置上限＋no-store＋浮水印含日期"
```

---

### Task 4: 前端 `GamesTab` device_id＋403 處理＋試玩標籤

**Files:**
- Modify: `app/classroom/page.jsx`（模組層加 `getDeviceId`；`GamesTab` 約 487–620：state、single-game fetch effect 約 517–540、render 區約 585–615）

**Interfaces:**
- Consumes: games API 的 `?device_id=` param 與 `403 { error:"device_limit", limit }`（Task 3）。
- 註：`url` 類型在 fetch 前就 `setGameContent(selectedGame)` return（不打 API），故 device_id 只跟著 `html` 單一遊戲請求送出——符合「url 不套裝置上限」。

- [ ] **Step 1: 模組層加 `getDeviceId`** — 在檔案上方 helper 區（如 `GamesTab` 定義之前）加：

```js
function getDeviceId() {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("inrec_device_id");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("inrec_device_id", id); }
  return id;
}
```

- [ ] **Step 2: `GamesTab` 加 error state** — 在 `const [gameLoading, setGameLoading] = useState(false);` 附近加：

```js
const [gameError, setGameError] = useState("");
```

- [ ] **Step 3: single-game fetch 帶 device_id＋處理 403** — 把 `selectedGame` 那個 effect 裡的 `fetch(\`/api/classroom/games?id=${selectedGame.id}\`, {...})` 那條鏈**替換**為：

```js
    setGameError("");
    fetch(`/api/classroom/games?id=${selectedGame.id}&device_id=${getDeviceId()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async r => {
        if (r.status === 403) {
          const d = await r.json().catch(() => ({}));
          if (d.error === "device_limit") {
            if (!cancelled) setGameError(`已達裝置上限（${d.limit} 台）。請在其他常用裝置登出遊戲，或聯繫客服。`);
            return null;
          }
        }
        return r.json();
      })
      .then(data => {
        if (!data) return;
        const game = data.game;
        if (game && gameCache) gameCache.current[selectedGame.id] = game;
        if (!cancelled) setGameContent(game || null);
      })
      .catch(() => { if (!cancelled) setGameContent(null); })
      .finally(() => { if (!cancelled) setGameLoading(false); });
```

- [ ] **Step 4: render 裝置上限提示** — 在 render 區的 `{isUrlGame ? (…) : gameLoading ? (…) : (…srcDoc…)}` 三元**最前面**加一個 `gameError` 分支（變成 `{gameError ? (…) : isUrlGame ? …}`）：

```jsx
        {gameError ? (
          <div style={{ flex: 1, display: "grid", placeItems: "center", padding: "40px 20px", textAlign: "center" }}>
            <div>
              <div style={{ fontSize: 52, marginBottom: 16 }}>🔒</div>
              <p style={{ color: "#e2e8f0", fontSize: 15, lineHeight: 1.7, margin: 0, maxWidth: 320 }}>{gameError}</p>
            </div>
          </div>
        ) : isUrlGame ? (
```

- [ ] **Step 5: url 遊戲「試玩」標籤** — 在播放區標題 `🎮 {selectedGame.title}` 的 `</span>` 之後加：

```jsx
          {selectedGame.game_type === "url" && (
            <span style={{ marginLeft: 8, fontSize: 11, background: "#dbeafe", color: "#1d4ed8", padding: "2px 8px", borderRadius: 980, fontWeight: 600 }}>試玩</span>
          )}
```

- [ ] **Step 6: build 驗證** `npx next build 2>&1 | tail -12` → 綠。

- [ ] **Step 7: Commit**

```bash
git add app/classroom/page.jsx
git commit -m "feat: 遊戲前端 device_id＋裝置上限提示＋url 試玩標籤"
```

---

### Task 5: 後台 game_settings API＋GamesManagePage（url 提示＋裝置上限設定）

**Files:**
- Create: `app/api/admin/game-settings/route.js`（GET／PATCH `device_limit`）
- Modify: `app/admin/GamesManagePage.jsx`（url 公開試玩提示 約 301「遊戲類型」附近；頂部加裝置上限設定區）

**Interfaces:**
- Consumes: `game_settings`（Task 1）；admin 驗證**比照既有** `app/api/admin/customer/route.js` 開頭（`verifyAdminToken(req)` 的 import 與擋法，逐字沿用該檔寫法）。

- [ ] **Step 1: 建 `app/api/admin/game-settings/route.js`**（admin 驗證那兩行照 `app/api/admin/customer/route.js` 開頭抄）

```js
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
// ↓ 與 app/api/admin/customer/route.js 相同的 admin 驗證 import（照該檔抄）
import { verifyAdminToken } from "@/lib/admin-auth";

export async function GET(req) {
  const auth = verifyAdminToken(req);           // 回傳形狀照 customer route
  if (!auth?.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const { data, error } = await supabase
    .from("game_settings").select("device_limit").eq("id", "default").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ device_limit: data?.device_limit ?? 3 });
}

export async function PATCH(req) {
  const auth = verifyAdminToken(req);
  if (!auth?.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const n = parseInt(body.device_limit, 10);
  if (!Number.isInteger(n) || n < 1 || n > 20)
    return NextResponse.json({ error: "device_limit 需為 1–20 整數" }, { status: 400 });
  const { error } = await supabase
    .from("game_settings").update({ device_limit: n, updated_at: new Date().toISOString() }).eq("id", "default");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, device_limit: n });
}
```

> ⚠️ 實作前先開 `app/api/admin/customer/route.js` 看它 admin 驗證的**確切** import 路徑與回傳（`verifyAdminToken` 名稱/位置/`auth.ok` 欄位可能不同），照它改上面兩處驗證，勿照抄本檔猜測的 `@/lib/admin-auth`。

- [ ] **Step 2: GamesManagePage — url「公開試玩」提示** — 在「遊戲類型」select（約 301）選到 `url` 時、`external_url` 輸入欄附近，加一段常駐提示（`form.game_type === "url"` 時顯示）：

```jsx
{form.game_type === "url" && (
  <p style={{ fontSize: 12, color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 10px", margin: "6px 0 0" }}>
    ⚠️ 公開試玩：此網址任何人都能開啟／分享，<b>付費內容請改用「HTML 內嵌」</b>（才有登入＋購買＋裝置上限保護）。
  </p>
)}
```

- [ ] **Step 3: GamesManagePage — 裝置上限設定區** — 在頁面頂部（清單之上）加一個小設定區：mount 時 `GET /api/admin/game-settings` 帶回 `device_limit` 填入 input；「儲存」按鈕 `PATCH`。用該檔既有的 `api()` helper（若無則比照既有 fetch 帶 admin token 寫法）。

```jsx
// state（元件內）
const [deviceLimit, setDeviceLimit] = useState(3);
const [dlSaved, setDlSaved] = useState(false);
// mount effect：api("/api/admin/game-settings") → setDeviceLimit(d.device_limit)
// JSX（清單上方）：
<div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 16px", fontSize: 14 }}>
  <span>遊戲同時登入裝置上限：</span>
  <input type="number" min={1} max={20} value={deviceLimit}
    onChange={e => { setDeviceLimit(e.target.value); setDlSaved(false); }}
    style={{ width: 64, padding: "6px 8px", border: "1px solid #d5dce6", borderRadius: 8 }} />
  <button onClick={async () => {
    await api("/api/admin/game-settings", { method: "PATCH", body: JSON.stringify({ device_limit: Number(deviceLimit) }) });
    setDlSaved(true);
  }}>儲存</button>
  {dlSaved && <span style={{ color: "#16a34a" }}>已儲存 ✓</span>}
</div>
```

> 實作前確認該檔既有 `api()`/fetch helper 的簽名（是否自動帶 admin token、body 是否需 stringify），照既有慣例微調上面呼叫。

- [ ] **Step 4: build 驗證** `npx next build 2>&1 | tail -12` → 綠、`/api/admin/game-settings` 在路由表。

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/game-settings/route.js app/admin/GamesManagePage.jsx
git commit -m "feat: 後台裝置上限設定＋url 公開試玩提示"
```

---

### Task 6: 部署＋端到端驗證

**Files:** 無（部署與驗證）。

- [ ] **Step 1: 全純函式測試綠** `npx vitest run lib/game-devices.test.js` → PASS。
- [ ] **Step 2: 確認正式 DB 已建表**（controller 在 Task 1 review 後於正式 DB `vmslzbcegfljlopkewpx` 執行 `supabase-game-security.sql`）：`SELECT device_limit FROM game_settings;` → 1 列（3）；`SELECT count(*) FROM game_devices;` → 可執行。
- [ ] **Step 3: 推送＋部署** — ⚠️ 本 repo 另有 parallel session、`vercel --prod` 上傳工作樹：先 `gh auth switch --user inrecmusic`；push 後**確認 middleware 乾淨才部署**：
```bash
git push origin feat/point2-carousel
git diff --quiet HEAD -- middleware.js && ! grep -qw MID middleware.js && npx vercel --prod --yes || echo "middleware 被 parallel session 動，暫緩"
```
- [ ] **Step 4: 端到端驗證**：
  1. `curl` 帶有效 token 打 `/api/classroom/games?id=<html遊戲>`（**不帶** device_id）→ `400 device_required`。
  2. 帶 device_id、正常 → 200＋html 內含浮水印（email＋日期）＋回應 header `Cache-Control: no-store`。
  3. 用 4 個不同 device_id 連續打（上限 3）→ 第 4 個且最舊者被擠出 → `403 device_limit`。
  4. url 類型（試玩）遊戲不受 device 限制、前端顯示「試玩」標籤。
  5. 後台 GamesManagePage 改裝置上限→儲存→`GET` 回新值；建 url 遊戲時顯示公開試玩提示。

---

## 加值（第二階段，另開 plan）
- 裝置管理頁：學員自助「登出其他裝置」；後台看某學員的 `game_devices` 清單。
- 影片內容比照裝置上限（目前刻意只保護遊戲）。

