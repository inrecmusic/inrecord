# 教室右側單元欄：展開式清單 — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把播放頁右側單元欄從「標題右側四顆 emoji icon」改成「點單元展開、列出該單元真實內容項目」的手風琴清單，並讓尚無影片的單元／章節顯示「預計 9/30 上架」。

**Architecture:** 後端 `bootstrap` 既有的兩個輕查詢多撈 `id, title`，交給純函式算成「每單元的項目明細陣列」與「全課程總覽統計」一併回傳，前端零新增請求。前端把單元列改成手風琴（展開狀態由 `openUnitId` 單一 state 驅動、一次只開一個），展開項直接觸發下載或切分頁。

**Tech Stack:** Next.js 14 App Router、Supabase（service-role client）、vitest（純函式測試）、React inline styles（沿用 `app/classroom/watch/page.jsx` 既有寫法，該檔無 CSS module）

**規格來源：** `docs/superpowers/specs/2026-08-29-classroom-sidebar-accordion-design.md`

**前一版（右側 icon 版）已實作並 commit 在同一分支**，本計畫在其上往前疊。以下**明確保留、不得改動**：`materials.kind` 欄位、後台 `MaterialsManager` 類型選單、兩支 materials API、`bootstrap` 的 `games` `is_active` 過濾、`MaterialsSection` 的講義／樂譜分組與 `unit-handouts`／`unit-scores` 錨點、`UNIT_ICONS` 的 emoji 對應。

---

## Global Constraints

以下為**每個 Task 隱含的硬性要求**，違反即為該 Task 失敗：

1. **不得影響任何現有功能。** 這是前提，不是加分項。
   - 既有的錯誤處理、容錯降級、安全檢查（JWT 驗證、`published` 檢查、UUID 白名單、簽名 URL 300 秒、裝置上限）一律原樣保留，不得順手「簡化」。
   - 儀表板 `/classroom`（同一支 bootstrap 的非 playerMode 路徑）不得有任何行為變化。
   - `Promise.all` 既有七項的順序與位置索引不得變動（解構是位置對應的）。
   - 每個 Task 的 commit 前跑 `npm run build`，確認無新增錯誤，並在報告附上結果。
2. **最少的 code。** YAGNI，不加不必要的抽象或防禦，改動越小越好。
3. **現代寫法。** hooks、async/await、optional chaining、`??`、`??=`；不引入新依賴。
4. **寫完必驗證。** 核 diff 確認正確、無編碼錯誤或截斷（尤其中文與 emoji），不假設成功就交付。
5. **既有平行 session。** 工作樹上有其他 session 未提交的改動（`CLAUDE.md`、`vercel.json`、`app/admin/ChangelogPage.jsx`、`docs/演奏會前台_*`）。**每次 commit 只 `git add` 該 Task 明列的檔案路徑**，禁止 `git add -A` / `git add .`。commit 前先 `git branch --show-current` 確認在 `feat/point2-carousel`。
6. **文案為台灣繁體中文口語**，避開支語與 AI 腔。
7. **不改**：`games` / `videos` / `materials` 資料表結構、狀態圈與進度條樣式、`handleSelect`、抽屜遮罩與 `drawerOpen`、`isTablet` 判斷、`/classroom` 儀表板。

---

## File Structure

| 檔案 | 責任 | 動作 |
|---|---|---|
| `lib/unit-content.js` | 純函式：三份查詢結果 → 每單元項目明細 ＋ 全課程統計 | 修改（換形狀） |
| `lib/unit-content.test.js` | 上者的 vitest 測試 | 修改（換形狀） |
| `app/api/classroom/bootstrap/route.js` | 兩個查詢多撈 `id, title`；回 `contentItems` ＋ `contentStats` | 修改 |
| `app/classroom/watch/page.jsx` | 抽出可共用的下載函式；GamesTab 支援指定遊戲；側欄改手風琴 | 修改（分三個 Task） |

---

## Task 1: `lib/unit-content.js` 改回項目明細與統計

**Files:**
- Modify: `lib/unit-content.js`（整檔替換）
- Test: `lib/unit-content.test.js`（整檔替換）

**Interfaces:**
- Consumes: 無
- Produces:
  - `buildContentItems({ materials, games, videos })` → `Record<string, Array<{ kind, id, title }>>`
    - `kind` 為 `'handout' | 'score' | 'game' | 'assignment'`
    - 每個單元的陣列**已依 handout → score → game → assignment 排序**，同類型內維持傳入順序
    - 只收錄至少有一項內容的 video_id；`video_id` 為 null 的通用講義不計入
    - 作業項為 `{ kind: 'assignment', id: <video_id>, title: '作業繳交' }`
  - `summarizeContent(itemsMap, videoCount = 0)` → `{ videos, handout, score, game, assignment }`（皆為整數）
- **舊的 `buildContentFlags` 一併移除**（唯一呼叫端在 Task 2 同步改掉）

- [ ] **Step 1: 改寫測試**

把 `lib/unit-content.test.js` 整個檔案替換為：

```js
import { describe, it, expect } from "vitest";
import { buildContentItems, summarizeContent } from "./unit-content";

const V1 = "11111111-1111-1111-1111-111111111111";
const V2 = "22222222-2222-2222-2222-222222222222";

describe("buildContentItems", () => {
  it("沒有輸入時回空物件", () => {
    expect(buildContentItems()).toEqual({});
    expect(buildContentItems({})).toEqual({});
  });

  it("依 kind 分流講義與樂譜，並帶出 id 與標題", () => {
    const items = buildContentItems({
      materials: [
        { id: "m1", video_id: V1, kind: "handout", title: "和弦表速查" },
        { id: "m2", video_id: V1, kind: "score", title: "小星星（簡易版）" },
      ],
    });
    expect(items[V1]).toEqual([
      { kind: "handout", id: "m1", title: "和弦表速查" },
      { kind: "score", id: "m2", title: "小星星（簡易版）" },
    ]);
  });

  it("kind 為 null／未知值一律當講義（對應 DB 預設與舊資料）", () => {
    const items = buildContentItems({
      materials: [
        { id: "m1", video_id: V1, kind: null, title: "A" },
        { id: "m2", video_id: V2, kind: "weird", title: "B" },
      ],
    });
    expect(items[V1][0].kind).toBe("handout");
    expect(items[V2][0].kind).toBe("handout");
  });

  it("全課程通用講義（video_id 為 null）不產生任何單元項目", () => {
    expect(buildContentItems({ materials: [{ id: "m1", video_id: null, kind: "score", title: "通用" }] })).toEqual({});
  });

  it("games 產生 game 項目，video_id 為 null 者略過", () => {
    const items = buildContentItems({
      games: [{ id: "g1", video_id: V1, title: "音符找找看" }, { id: "g2", video_id: null, title: "略過" }],
    });
    expect(items[V1]).toEqual([{ kind: "game", id: "g1", title: "音符找找看" }]);
    expect(Object.keys(items)).toEqual([V1]);
  });

  it("assignment_desc 有實質內容才產生作業項，id 用 video_id", () => {
    const items = buildContentItems({
      videos: [
        { id: V1, assignment_desc: "彈完整首並錄影" },
        { id: V2, assignment_desc: "   " },
      ],
    });
    expect(items[V1]).toEqual([{ kind: "assignment", id: V1, title: "作業繳交" }]);
    expect(Object.keys(items)).toEqual([V1]);
  });

  it("同一單元多來源合併，且依 講義→樂譜→遊戲→作業 排序", () => {
    const items = buildContentItems({
      materials: [
        { id: "m2", video_id: V1, kind: "score", title: "樂譜" },
        { id: "m1", video_id: V1, kind: "handout", title: "講義" },
      ],
      games: [{ id: "g1", video_id: V1, title: "遊戲" }],
      videos: [{ id: V1, assignment_desc: "作業內容" }],
    });
    expect(items[V1].map((i) => i.kind)).toEqual(["handout", "score", "game", "assignment"]);
  });

  it("同類型內維持傳入順序", () => {
    const items = buildContentItems({
      materials: [
        { id: "m1", video_id: V1, kind: "handout", title: "第一份" },
        { id: "m2", video_id: V1, kind: "handout", title: "第二份" },
      ],
    });
    expect(items[V1].map((i) => i.title)).toEqual(["第一份", "第二份"]);
  });

  it("缺標題時回空字串而非 undefined", () => {
    const items = buildContentItems({ materials: [{ id: "m1", video_id: V1, kind: "handout" }] });
    expect(items[V1][0].title).toBe("");
  });

  it("容忍清單中的 null／缺欄位元素，不拋錯", () => {
    const items = buildContentItems({
      materials: [null, {}, { id: "m1", video_id: V1, kind: "score", title: "X" }],
      games: [null, {}],
      videos: [null, {}, { id: V1 }],
    });
    expect(items[V1]).toEqual([{ kind: "score", id: "m1", title: "X" }]);
  });
});

describe("summarizeContent", () => {
  it("沒有輸入時各項為 0", () => {
    expect(summarizeContent()).toEqual({ videos: 0, handout: 0, score: 0, game: 0, assignment: 0 });
  });

  it("跨單元加總各類型數量，videos 用傳入的影片總數", () => {
    const map = {
      [V1]: [
        { kind: "handout", id: "m1", title: "A" },
        { kind: "handout", id: "m2", title: "B" },
        { kind: "score", id: "m3", title: "C" },
        { kind: "assignment", id: V1, title: "作業繳交" },
      ],
      [V2]: [
        { kind: "score", id: "m4", title: "D" },
        { kind: "game", id: "g1", title: "E" },
      ],
    };
    expect(summarizeContent(map, 21)).toEqual({ videos: 21, handout: 2, score: 2, game: 1, assignment: 1 });
  });

  it("videoCount 缺省為 0，未知 kind 不計入", () => {
    const map = { [V1]: [{ kind: "mystery", id: "x", title: "?" }, { kind: "game", id: "g1", title: "G" }] };
    expect(summarizeContent(map)).toEqual({ videos: 0, handout: 0, score: 0, game: 1, assignment: 0 });
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/unit-content.test.js`
Expected: FAIL — `buildContentItems is not a function`（舊檔只匯出 `buildContentFlags`）

- [ ] **Step 3: 改寫實作**

把 `lib/unit-content.js` 整個檔案替換為：

```js
// 由 materials / games / videos 三份清單彙整「每個單元有哪些內容項目」，
// 供播放頁右側單元欄展開時直接列出真實項目名稱。純函式、無 IO，由 bootstrap 在伺服器端呼叫。
// 只收錄至少有一項內容的單元；全課程通用講義（video_id 為 null）不掛在任何單元上。
const KIND_ORDER = ["handout", "score", "game", "assignment"];

export function buildContentItems({ materials = [], games = [], videos = [] } = {}) {
  const items = {};
  const push = (id, item) => ((items[id] ??= []).push(item));

  for (const m of materials) {
    if (!m?.video_id) continue;
    push(m.video_id, { kind: m.kind === "score" ? "score" : "handout", id: m.id, title: m.title ?? "" });
  }
  for (const g of games) {
    if (g?.video_id) push(g.video_id, { kind: "game", id: g.id, title: g.title ?? "" });
  }
  for (const v of videos) {
    if (v?.id && v.assignment_desc?.trim()) push(v.id, { kind: "assignment", id: v.id, title: "作業繳交" });
  }

  // 固定順序：先看的（講義、樂譜）、再練的（遊戲）、最後交的（作業）。
  // 位置一致，學員掃第二個單元時不用重新找。同類型內維持傳入順序（sort 為穩定排序）。
  for (const list of Object.values(items)) {
    list.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  }
  return items;
}

// 全課程總覽統計：側欄頂端「本課程共 N 支影片 · N 份講義…」用。
export function summarizeContent(itemsMap = {}, videoCount = 0) {
  const out = { videos: videoCount, handout: 0, score: 0, game: 0, assignment: 0 };
  for (const list of Object.values(itemsMap)) {
    for (const it of list) if (it?.kind in out && it.kind !== "videos") out[it.kind] += 1;
  }
  return out;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/unit-content.test.js`
Expected: PASS，13 passed

- [ ] **Step 5: 跑全套測試**

Run: `npm test`
Expected: 全數通過（`bootstrap` 尚未改，但它不在測試涵蓋範圍，不影響）

- [ ] **Step 6: 驗證 build**

Run: `npm run build`
Expected: **會失敗**，因為 `bootstrap/route.js` 仍 import 已移除的 `buildContentFlags`。這是預期的，Task 2 會修好。**本 Task 允許 build 失敗，但必須在報告中註明失敗訊息確實只有這一項。**

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # 必須是 feat/point2-carousel
git add lib/unit-content.js lib/unit-content.test.js
git commit -m "單元內容純函式改回項目明細與總覽統計"
```

---

## Task 2: bootstrap 回傳 contentItems 與 contentStats

**Files:**
- Modify: `app/api/classroom/bootstrap/route.js`

**Interfaces:**
- Consumes: Task 1 的 `buildContentItems`、`summarizeContent`
- Produces: `GET /api/classroom/bootstrap?player=1` 回應新增兩個欄位（**非 playerMode 一律不含**）：
  - `contentItems`: `Record<string, Array<{ kind, id, title }>>`
  - `contentStats`: `{ videos, handout, score, game, assignment }`
  - **`contentFlags` 欄位移除**

**不得改動：** `requireClassroomAuth`、`enforceDeviceLimit`、未購課提前 return、`videoCols` 依模式切換、`Promise.all` 七項的**順序與位置**、既有容錯降級、`games` 的 `.not("is_active","is",false)` 過濾、`materials` 的 `.not("video_id","is",null)` 過濾。

- [ ] **Step 1: 換 import**

把檔案頂端這行：

```js
import { buildContentFlags } from "@/lib/unit-content";
```

替換為：

```js
import { buildContentItems, summarizeContent } from "@/lib/unit-content";
```

- [ ] **Step 2: 兩個查詢多撈 id 與標題**

把 `Promise.all` 中的 materials 查詢改為（**只改 select 字串，其餘一字不動**）：

```js
      ? supabase.from("materials").select("id, video_id, kind, title").not("video_id", "is", null)
```

games 查詢改為：

```js
      ? supabase.from("games").select("id, video_id, title").not("video_id", "is", null).not("is_active", "is", false)
```

- [ ] **Step 3: 換算出項目明細與統計**

把既有的這一段：

```js
    out.contentFlags = buildContentFlags({
      materials: matRes.data || [],
      games: gameRes.data || [],
      videos: out.videos,
    });
```

替換為：

```js
    out.contentItems = buildContentItems({
      materials: matRes.data || [],
      games: gameRes.data || [],
      videos: out.videos,
    });
    out.contentStats = summarizeContent(out.contentItems, totalCount);
```

（同一個 `if (playerMode) { ... }` 區塊內，上方兩行 `console.error` 容錯原樣保留。）

- [ ] **Step 4: 驗證 build**

Run: `npm run build`
Expected: 成功（Task 1 造成的 import 失敗於此修復）

- [ ] **Step 5: 跑全套測試**

Run: `npm test`
Expected: 全數通過

- [ ] **Step 6: 靜態核對並寫進報告**

不需要跑 dev server。核 diff 確認並在報告中逐項回答：

(a) `Promise.all` 陣列元素數量仍為 7，且 chapters／videos／progress／count／announcements 五項的位置索引未變
(b) 非 playerMode 時 `out` 不會出現 `contentItems`／`contentStats`（兩者都只在 `if (playerMode)` 內賦值，且 `out` 初值物件沒有這兩個 key）
(c) `contentFlags` 已完全從本檔消失

- [ ] **Step 7: Commit**

```bash
git add app/api/classroom/bootstrap/route.js
git commit -m "bootstrap 回傳單元內容明細與總覽統計"
```

---

## Task 3: 抽出可共用的講義下載函式

**Files:**
- Modify: `app/classroom/watch/page.jsx`（`MaterialsSection` 的 `openMaterial`，約 288–305 行）

**Interfaces:**
- Consumes: 無
- Produces: 模組層級 `async function openMaterialById(token, id)` → `Promise<boolean>`（成功 `true`、失敗 `false`）。Task 5 的側欄展開項會呼叫它。

**這是純重構，對使用者行為零改變。**

**不得改動：** 「先同步開空白分頁（`window.open("", "_blank", "noopener,noreferrer")`）再 await 簽名 URL」的防彈窗攔截順序、`freshToken` 呼叫、失敗時 `w.close()`、`MaterialsSection` 的 `busyId` 與 `err` 狀態行為與文案。

- [ ] **Step 1: 新增模組層級函式**

在 `/* 捲到指定區塊並閃一下。... */` 的 `revealSection` 函式**之前**插入：

```jsx
/* 取新鮮簽名 URL 並開新分頁下載講義／樂譜。成功回 true。
   必須在點擊的同步脈絡下先開空白分頁，await 之後再 window.open 會被瀏覽器彈窗攔截。 */
async function openMaterialById(token, id) {
  const w = typeof window !== "undefined" ? window.open("", "_blank", "noopener,noreferrer") : null;
  try {
    const tk = await freshToken(token);
    const r = await fetch(`/api/classroom/materials?id=${id}`, { headers: { Authorization: `Bearer ${tk}` } });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.url) { if (w) w.location.href = d.url; else window.location.href = d.url; return true; }
  } catch {}
  if (w) w.close();
  return false;
}
```

- [ ] **Step 2: 讓 MaterialsSection 改用它**

把 `MaterialsSection` 內的整個 `openMaterial` 函式替換為：

```jsx
  async function openMaterial(id) {
    if (!token || busyId) return;
    setErr(""); setBusyId(id);
    const ok = await openMaterialById(token, id);
    if (!ok) setErr("檔案暫時無法下載，請稍後再試");
    setBusyId(null);
  }
```

- [ ] **Step 3: 驗證 build**

Run: `npm run build`
Expected: 成功

- [ ] **Step 4: 跑全套測試**

Run: `npm test`
Expected: 全數通過

- [ ] **Step 5: 核對重構等價性並寫進報告**

逐項確認並在報告回答：`window.open` 仍在任何 `await` 之前呼叫；成功時走 `w.location.href`、無 `w` 時走 `window.location.href`；失敗時 `w.close()`；錯誤文案仍為「檔案暫時無法下載，請稍後再試」；`busyId` 的設定與清除時機不變。

- [ ] **Step 6: Commit**

```bash
git add app/classroom/watch/page.jsx
git commit -m "抽出 openMaterialById 供側欄共用（純重構）"
```

---

## Task 4: GamesTab 支援從側欄指定遊戲

**Files:**
- Modify: `app/classroom/watch/page.jsx`（`GamesTab`，約 583 行起；以及約 1492 行的 `<GamesTab ... />`）

**Interfaces:**
- Consumes: 無
- Produces: `GamesTab` 新增兩個選用 prop：`pendingGameId`（string | null）與 `onPendingConsumed`（() => void）。清單載入後若 `pendingGameId` 命中其中一支，自動選中並呼叫 `onPendingConsumed()`；**未命中則不消耗 pending**，等後續 `games` 更新再試（切換單元時舊清單仍在，無條件消耗會讓自動選中永遠失效）。

**不得改動：** 既有的 `hasSubscription`／`token`／`videoId` effect 依賴與重置邏輯、`gameCache` 快取鍵、失敗不快取的守則、裝置上限 403 處理、`cancelled` 競態保護。

- [ ] **Step 1: 加 props 與自動選中 effect**

把 `GamesTab` 的函式簽章改為：

```jsx
function GamesTab({ token, hasSubscription, video, gameCache, pendingGameId, onPendingConsumed }) {
```

在既有的「載入遊戲清單」effect **之後**（`}, [hasSubscription, token, videoId]);` 那行之後）插入：

```jsx
  // 從側欄點特定遊戲進來：等清單載好再選中。
  // 只有命中才消耗 pending——切換單元的那一輪 games 還是舊單元的清單，
  // 這時無條件消耗會把 pending 清掉，等新清單載入時就永遠選不到了。
  useEffect(() => {
    if (!pendingGameId || !games.length) return;
    const hit = games.find(g => g.id === pendingGameId);
    if (!hit) return;
    setSelectedGame(hit);
    onPendingConsumed?.();
  }, [pendingGameId, games]);
```

- [ ] **Step 2: 在 WatchPage 加 state 並傳入**

在 `WatchPage` 的 `const [contentFlags, setContentFlags] = useState({});` 那行**替換**為（本行在 Task 5 會再改名，此處先一併處理）：

```jsx
  const [contentItems, setContentItems]   = useState({});
  const [contentStats, setContentStats]   = useState(null);
  const [pendingGameId, setPendingGameId] = useState(null);
```

把 bootstrap 成功處理區塊的 `setContentFlags(d.contentFlags || {});` 替換為：

```jsx
          setContentItems(d.contentItems || {});
          setContentStats(d.contentStats || null);
```

把約 1492 行的 GamesTab 渲染改為：

```jsx
            {tab === "games"      && <GamesTab token={token} hasSubscription={hasSubscription} video={currentVideo} gameCache={gameCacheRef} pendingGameId={pendingGameId} onPendingConsumed={() => setPendingGameId(null)} />}
```

- [ ] **Step 3: 暫時讓側欄改用 contentItems 以維持可編譯**

側欄目前有兩行引用舊的 `contentFlags`（約 1582–1583 行）。把：

```jsx
                    const flags      = contentFlags[v.id];
                    const icons      = flags ? UNIT_ICONS.filter(ic => flags[ic.key]) : [];
```

替換為：

```jsx
                    const kinds      = new Set((contentItems[v.id] || []).map(i => i.kind));
                    const icons      = UNIT_ICONS.filter(ic => kinds.has(ic.key));
```

（這是過渡寫法，讓 icon 版在 Task 5 改成手風琴之前仍可正常運作、build 不壞。）

- [ ] **Step 4: 驗證 build**

Run: `npm run build`
Expected: 成功

- [ ] **Step 5: 跑全套測試**

Run: `npm test`
Expected: 全數通過

- [ ] **Step 6: Commit**

```bash
git add app/classroom/watch/page.jsx
git commit -m "GamesTab 支援側欄指定遊戲；側欄改讀 contentItems"
```

---

## Task 5: 側欄改成手風琴展開式

**Files:**
- Modify: `app/classroom/watch/page.jsx`（模組頂端常數區；`WatchPage` 的 state 與點擊處理；側欄章節與單元列渲染，約 1555–1680 行）

**Interfaces:**
- Consumes: Task 2 的 `d.contentItems` / `d.contentStats`、Task 3 的 `openMaterialById`、Task 4 的 `pendingGameId` 機制、既有的 `revealSection`
- Produces: 無（UI 終點）

**不得改動：** 頂部學習進度條區塊、狀態圈的尺寸與配色邏輯、`handleSelect`、抽屜遮罩與 `drawerOpen`、`isTablet`、`UNIT_ICONS` 的 emoji 與順序。

- [ ] **Step 1: 加「預計上架」常數**

在 `UNIT_ICONS` 常數**之後**加：

```jsx
// 尚未上傳影片的單元／尚無單元的章節顯示此文案。改期只需改這一行。
const COMING_SOON = "預計 9/30 上架";
```

- [ ] **Step 2: 加展開狀態與展開項點擊處理**

在 `WatchPage` 內、`handleIconClick` 函式**整個替換**為：

```jsx
  // 手風琴：展開的單元 id。一次只開一個——21 個單元全展開會讓側欄無法掃視。
  // 有影片的單元點了同時切換播放；沒影片的單元只展開（仍可下載講義樂譜）。
  function handleUnitClick(v) {
    setItemErr("");   // 換單元就清掉上一個單元的下載錯誤，否則會跟著顯示在新展開的面板裡
    setOpenUnitId(prev => (prev === v.id ? null : v.id));
    if (v.bunny_video_id || v.vimeo_id) handleSelect(v);
  }

  // 點展開清單裡的項目：講義樂譜直接下載，遊戲與作業切到對應分頁。
  async function handleItemClick(e, v, item) {
    e.stopPropagation();
    if (v.bunny_video_id || v.vimeo_id) handleSelect(v);
    if (item.kind === "game") { setPendingGameId(item.id); setTab("games"); return; }
    if (item.kind === "assignment") { setTab("assignment"); return; }
    setItemErr("");
    const ok = await openMaterialById(token, item.id);
    if (!ok) setItemErr("檔案暫時無法下載，請稍後再試");
  }
```

在 Task 4 新增的三個 state 之後再加：

```jsx
  const [openUnitId, setOpenUnitId]       = useState(null);
  const [itemErr, setItemErr]             = useState("");
```

並在 `currentVideo` 變動時同步展開（放在既有其他 `useEffect` 之後即可）：

```jsx
  // 正在上的單元預設展開（也涵蓋從儀表板帶 ?v= 進來的情況）
  useEffect(() => { if (currentVideo?.id) setOpenUnitId(currentVideo.id); }, [currentVideo?.id]);
```

- [ ] **Step 3: 側欄頂端加課程總覽統計**

在側欄「Progress」區塊的 `<div style={{ padding: "14px 18px 12px", ... }}>` **之前**插入：

```jsx
          {/* 課程總覽：讓學員一眼看到總量 */}
          {contentStats && (
            <div style={{
              padding: "11px 16px", borderBottom: "1px solid rgba(0,0,0,0.06)",
              background: "#f8fbff", fontSize: 11.5, color: "#334155", lineHeight: 1.7, flexShrink: 0,
            }}>
              本課程共 {[
                [contentStats.videos, "支影片"],
                [contentStats.handout, "份講義"],
                [contentStats.score, "份樂譜"],
                [contentStats.game, "個互動遊戲"],
                [contentStats.assignment, "份作業"],
              ].filter(([n]) => n > 0).map(([n, unit], i) => (
                <span key={unit}>
                  {i > 0 && " · "}
                  <b style={{ color: "#2563eb", fontWeight: 700 }}>{n}</b> {unit}
                </span>
              ))}
            </div>
          )}
```

- [ ] **Step 4: 章節不再因為沒單元就整章消失**

把側欄的：

```jsx
              const cv = videos.filter(v => v.chapter_id === c.id);
              if (!cv.length) return null;
```

替換為：

```jsx
              const cv = videos.filter(v => v.chapter_id === c.id);
```

並在該章節 `<div key={c.id} style={{ marginBottom: 4 }}>` 內、章節標題之後、`{cv.map(...)}` 之前插入空章節提示：

```jsx
                  {!cv.length && (
                    <div style={{ fontSize: 12, color: "#94a3b8", padding: "4px 8px 8px 14px" }}>
                      單元準備中，{COMING_SOON}
                    </div>
                  )}
```

- [ ] **Step 5: 單元列改成手風琴**

把整段 `{cv.map((v, idx) => { ... })}` 替換為：

```jsx
                  {cv.map((v, idx) => {
                    const isActive   = v.id === currentVideo?.id;
                    const pe         = progMap[v.id];
                    const done       = !!pe?.completed;
                    const watchPct   = (pe?.total_seconds > 0)
                      ? Math.min(100, Math.round((pe.watched_seconds / pe.total_seconds) * 100))
                      : 0;
                    const isWatching = !done && watchPct > 0;
                    const items      = contentItems[v.id] || [];
                    const playable   = !!(v.bunny_video_id || v.vimeo_id);
                    const isOpen     = openUnitId === v.id;
                    return (
                      <div key={v.id}>
                        <div
                          role="button" tabIndex={0}
                          aria-expanded={items.length ? isOpen : undefined}
                          onClick={() => handleUnitClick(v)}
                          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleUnitClick(v); } }}
                          style={{
                            display: "flex", alignItems: "flex-start", gap: 2,
                            padding: "7px 8px 7px 4px", borderRadius: 9, cursor: "pointer",
                            background: isActive ? "rgba(37,99,235,0.08)" : "transparent",
                            transition: "background .1s",
                          }}
                          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
                          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                        >
                          {/* 展開指示 */}
                          <div style={{
                            width: 14, flexShrink: 0, paddingTop: 5, textAlign: "center",
                            fontSize: 9, color: isOpen ? "#2563eb" : "#cbd5e1",
                            transform: isOpen ? "rotate(90deg)" : "none",
                            transformOrigin: "center 10px", transition: "transform .2s ease, color .12s",
                            visibility: items.length ? "visible" : "hidden",
                          }}>▶</div>

                          {/* Status indicator */}
                          <div style={{
                            width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                            display: "grid", placeItems: "center",
                            fontSize: 10.5, fontWeight: 600, margin: "1px 8px 0 2px",
                            background: isActive ? "#2563eb" : done ? "rgba(22,163,74,0.12)" : isWatching ? "rgba(37,99,235,0.08)" : "#f1f5f9",
                            color: isActive ? "#fff" : done ? "#16a34a" : isWatching ? "#2563eb" : "#64748b",
                            border: `1.5px solid ${isActive ? "#2563eb" : done ? "rgba(22,163,74,0.4)" : isWatching ? "rgba(37,99,235,0.3)" : "rgba(0,0,0,0.1)"}`,
                          }}>
                            {done && !isActive ? "✓" : idx + 1}
                          </div>

                          {/* Title + meta */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 13, lineHeight: 1.45,
                              fontWeight: isActive ? 600 : 400,
                              color: isActive ? "#2563eb" : playable ? "#334155" : "#94a3b8",
                              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                            }}>
                              {v.title}
                            </div>
                            {!playable ? (
                              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{COMING_SOON}</div>
                            ) : isWatching ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3 }}>
                                <div style={{ flex: 1, height: 3, background: "#e2e8f0", borderRadius: 2 }}>
                                  <div style={{ width: `${watchPct}%`, height: "100%", background: "#2563eb", borderRadius: 2 }} />
                                </div>
                                <span style={{ fontSize: 10, color: "#2563eb", flexShrink: 0 }}>{watchPct}%</span>
                              </div>
                            ) : (
                              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                                {v.duration && <span>{v.duration}</span>}
                                {items.length > 0 && <span style={{ color: "#b6c0cd" }}>{items.length} 項</span>}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 展開內容：該單元的真實項目 */}
                        {isOpen && items.length > 0 && (
                          <div style={{ padding: "2px 8px 8px 37px" }}>
                            {items.map(item => {
                              const ic = UNIT_ICONS.find(x => x.key === item.kind);
                              return (
                                <div key={`${item.kind}-${item.id}`}
                                  role="button" tabIndex={0}
                                  aria-label={`${item.title} — ${ic?.label}`}
                                  onClick={e => handleItemClick(e, v, item)}
                                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleItemClick(e, v, item); } }}
                                  style={{
                                    display: "flex", alignItems: "center", gap: 9,
                                    padding: "6px 9px", borderRadius: 8, cursor: "pointer",
                                    fontSize: 12.5, color: "#334155", transition: "background .12s, color .12s",
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(37,99,235,0.07)"; e.currentTarget.style.color = "#2563eb"; }}
                                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#334155"; }}
                                >
                                  <span style={{ fontSize: 13, flexShrink: 0 }}>{ic?.emoji}</span>
                                  <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {item.title}
                                  </span>
                                  <span style={{ fontSize: 10, color: "#94a3b8", flexShrink: 0 }}>{ic?.label}</span>
                                </div>
                              );
                            })}
                            {itemErr && <div style={{ fontSize: 11.5, color: "#b45309", padding: "4px 9px 0" }}>{itemErr}</div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
```

- [ ] **Step 6: 驗證 build**

Run: `npm run build`
Expected: 成功，無新增錯誤

- [ ] **Step 7: 跑全套測試**

Run: `npm test`
Expected: 全數通過

- [ ] **Step 8: 核對「不得改動」清單並寫進報告**

逐項核 diff 確認：頂部學習進度條區塊、狀態圈的尺寸與配色三元式、`handleSelect`、抽屜遮罩與 `drawerOpen`、`isTablet`、`UNIT_ICONS` 的 emoji 與順序，全部未被更動。

- [ ] **Step 9: Commit**

```bash
git add app/classroom/watch/page.jsx
git commit -m "側欄改成手風琴展開式＋課程總覽統計＋預計上架狀態"
```

---

## Task 6: 驗收與 preview 部署

**Files:** 無（純驗證）

**Interfaces:**
- Consumes: Task 1–5 全部
- Produces: 可上正式站的結論

- [ ] **Step 1: 準備測試資料**

用 Supabase MCP 對專案 `vmslzbcegfljlopkewpx` 插入測試列（標題一律 `[SDD測試]` 開頭，便於清除）。取一支已發布影片的 id 掛講義與樂譜各一、另插一筆 `video_id` 為 NULL 的通用講義：

```sql
INSERT INTO materials (video_id, kind, title, storage_path, file_size, sort_order) VALUES
  ('<已發布影片 id>', 'handout', '[SDD測試] 和弦表速查', 'materials/__sdd_h.pdf', 1024, 1),
  ('<已發布影片 id>', 'score',   '[SDD測試] 小星星（簡易版）', 'materials/__sdd_s.pdf', 2048, 2),
  (NULL,              'handout', '[SDD測試] 全課程通用講義', 'materials/__sdd_c.pdf', 512, 3);
```

- [ ] **Step 2: 部署 preview**

```bash
gh auth switch --user inrecmusic
git push origin feat/point2-carousel
npx vercel --yes
```

Expected: `readyState: READY`，取得 preview 網址。

- [ ] **Step 3: 新功能驗收**

在 preview 播放頁逐項確認：
- 頂端總覽統計數字與 DB 實際資料相符
- 點單元會展開，且**切到別的單元時舊的自動收起**（一次只開一個）
- 展開項顯示**真實名稱**（「[SDD測試] 小星星（簡易版）」而非「樂譜」），emoji 與右側類型標籤正確
- 點講義／樂譜項 → 觸發下載（測試列的 storage_path 是假的，會顯示「檔案暫時無法下載」，這代表流程有走到）
- 點遊戲項 → 切到「互動遊戲」分頁且該遊戲被選中
- 點作業項 → 切到「作業繳交」分頁
- 通用講義（`video_id` NULL）**不出現在任何單元的展開清單**，但仍在播放器下方講義區並標「（通用）」
- 沒有影片的單元顯示「預計 9/30 上架」、標題轉灰、點了不切換播放但仍可展開
- 沒有單元的章節仍顯示章節標題＋「單元準備中，預計 9/30 上架」
- 鍵盤：Tab 可走到單元列與展開項，Enter／Space 可觸發（兩者都是 `role="button" tabIndex={0}`）

- [ ] **Step 4: 既有功能迴歸**

- 播放器正常播放、進度與百分比照常更新
- 側欄狀態圈（未看／觀看中 %／已完成 ✓）與頂部學習進度條正確
- 課程評價、作業繳交（含上傳圖片）、互動遊戲、筆記四個分頁都正常
- 留言區「此單元／不分單元」切換正常、公告橫幅正常
- 平板／手機（≤1024px）抽屜可開關、點單元後自動收起
- `/classroom` 儀表板完全正常（其 bootstrap 回應不應含 `contentItems`／`contentStats`）
- 後台講義管理：上傳講義／樂譜、刪除、類型標籤皆正常

- [ ] **Step 5: 清除測試資料**

```sql
DELETE FROM materials WHERE title LIKE '[SDD測試]%';
```

並以 `SELECT count(*) FROM materials WHERE title LIKE '[SDD測試]%';` 確認為 0。

- [ ] **Step 6: 回報交付摘要**

明確列出：動到哪些檔案與行為、哪些既有功能經過迴歸驗證、正式站上線還缺什麼。**不自行 `vercel --prod`**，等使用者指示。

---

## Self-Review

**Spec coverage**

| 規格要求 | 對應 Task |
|---|---|
| 點單元＝切換影片＋展開 | Task 5 Step 2（`handleUnitClick`） |
| 一次只開一個 | Task 5 Step 2（`openUnitId` 單一 state） |
| 正在上的單元預設展開 | Task 5 Step 2（`currentVideo` 同步 effect） |
| 收合時顯示「N 項」計數 | Task 5 Step 5 |
| 側欄寬度 360 / 抽屜 min(380px,88vw) | 前一版已實作，本計畫不動 |
| 標題兩行 clamp | Task 5 Step 5 |
| 展開列出真實項目名稱 | Task 1（明細）＋ Task 5 Step 5（渲染） |
| 講義／樂譜點了直接下載 | Task 3（`openMaterialById`）＋ Task 5 Step 2 |
| 遊戲點了切分頁並選中該遊戲 | Task 4（`pendingGameId`）＋ Task 5 Step 2 |
| 作業點了切分頁 | Task 5 Step 2 |
| icon 沿用 emoji、順序固定 | Task 5 Step 5 沿用 `UNIT_ICONS`，未改該常數 |
| 沒影片的單元顯示「預計 9/30 上架」 | Task 5 Step 5（`playable` 判斷） |
| 沒單元的章節仍顯示＋提示 | Task 5 Step 4 |
| 日期字串集中一處 | Task 5 Step 1（`COMING_SOON`） |
| 頂部課程總覽統計 | Task 1（`summarizeContent`）＋ Task 2 ＋ Task 5 Step 3 |
| 通用講義不掛單元、仍顯示在講義區 | Task 1（跳過 null video_id）＋ Task 2（`.not` 過濾保留）＋ `MaterialsSection` 未動 |
| 後端沿用不動的項目 | Task 2 的「不得改動」清單、Task 3/4/5 各自的清單 |
| 儀表板零影響 | Task 2 Step 6(b) 靜態核對 ＋ Task 6 Step 4 |

**Type consistency**

- `{ kind, id, title }` 三欄在 `buildContentItems`、測試、`summarizeContent`、Task 5 渲染四處一致。
- `kind` 值域 `handout | score | game | assignment` 與 `UNIT_ICONS` 的 `key` 完全對應（Task 5 用 `UNIT_ICONS.find(x => x.key === item.kind)`）。
- `contentStats` 的欄位名 `{ videos, handout, score, game, assignment }` 在 `summarizeContent`、Task 2、Task 5 Step 3 三處一致。
- `openMaterialById(token, id)` 回 boolean，Task 3 定義、Task 3 與 Task 5 兩處呼叫，簽章一致。
- `pendingGameId` / `onPendingConsumed` 在 Task 4 定義與傳入、Task 5 Step 2 設定，名稱一致。
- Task 4 Step 3 的過渡寫法在 Task 5 Step 5 被整段取代，不會殘留。

**Placeholder scan**：無 TBD／TODO；所有程式步驟皆附完整程式碼；所有指令皆附預期輸出。Task 1 Step 6 刻意允許 build 失敗，已明確標註原因與 Task 2 的修復點。
