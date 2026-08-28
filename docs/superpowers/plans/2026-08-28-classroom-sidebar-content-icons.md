# 教室右側單元欄：加寬 ＋ 單元內容 icon — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 播放頁右側單元欄加寬到 360px，每個單元標題右側顯示該單元實際掛載內容的 emoji icon（📎 講義 / 🎼 樂譜 / 🎮 互動遊戲 / 📝 作業），點下去切換單元並直接開啟對應區塊。

**Architecture:** 內容旗標在伺服器端彙整——`/api/classroom/bootstrap?player=1` 既有的 `Promise.all` 加兩個只撈索引欄位的查詢（`materials`、`games`），交給新的純函式 `lib/unit-content.js` 算成 `{ [video_id]: { handout, score, game, assignment } }` 一併回傳。前端零新增請求。樂譜靠 `materials` 新增的 `kind` 欄位與講義區分。

**Tech Stack:** Next.js 14 App Router、Supabase（service-role client）、vitest（純函式測試）、React inline styles（沿用 `app/classroom/watch/page.jsx` 既有寫法，該檔無 CSS module）

**規格來源：** `docs/superpowers/specs/2026-08-28-classroom-sidebar-content-icons-design.md`

---

## Global Constraints

以下為**每個 Task 隱含的硬性要求**，違反即為該 Task 失敗：

1. **不得影響任何現有功能。** 這是前提，不是加分項。
   - 新資料表欄位一律帶 `DEFAULT`，讓既有列行為完全不變。
   - 改共用元件／API 前先確認還有誰在用；能只加不改就不要改既有分支。
   - 既有的錯誤處理、容錯降級、註解、安全檢查（JWT 驗證、`published` 檢查、UUID 白名單、簽名 URL 有效期）一律原樣保留，不得順手「簡化」。
   - 每個 Task 的 commit 前跑 `npm run build`，確認無新增錯誤。
2. **最少的 code。** YAGNI，不加不必要的抽象或防禦，改動越小越好。
3. **現代寫法。** hooks、async/await、optional chaining、`??`、`||=`；不引入新依賴。
4. **寫完必驗證。** 每次改動後核 diff 確認正確、無編碼錯誤或截斷（尤其中文），不假設成功就交付。
5. **既有平行 session。** 工作樹上有其他 session 未提交的改動（`CLAUDE.md`、`vercel.json`、`app/admin/ChangelogPage.jsx`、`docs/演奏會前台_*`）。**每次 commit 只 `git add` 該 Task 明列的檔案路徑**，禁止 `git add -A` / `git add .`。commit 前先 `git branch --show-current` 確認在 `feat/point2-carousel`。
6. **文案為台灣繁體中文口語**，避開支語與 AI 腔。
7. **不改**：`games` / `videos` 資料表結構、單元列的狀態圈與進度條樣式、章節標題樣式、`/classroom` 儀表板。

---

## File Structure

| 檔案 | 責任 | 動作 |
|---|---|---|
| `lib/unit-content.js` | 純函式：三份清單 → 每單元內容旗標 | 建立 |
| `lib/unit-content.test.js` | 上者的 vitest 測試 | 建立 |
| `supabase-classroom-features.sql` | `materials.kind` 欄位（idempotent） | 修改 |
| `app/api/admin/materials/route.js` | 後台講義 CRUD，讀寫 `kind` | 修改 |
| `app/api/classroom/materials/route.js` | 教室講義清單，回傳 `kind` | 修改 |
| `app/admin/MaterialsManager.jsx` | 後台上傳表單「類型」選單 | 修改 |
| `app/api/classroom/bootstrap/route.js` | 播放頁單一往返，加回 `contentFlags` | 修改 |
| `app/classroom/watch/page.jsx` | `MaterialsSection` 拆兩組＋錨點；側欄加寬、兩行 clamp、icon 群組與點擊 | 修改 |

---

## Task 1: `lib/unit-content.js` 內容旗標純函式

**Files:**
- Create: `lib/unit-content.js`
- Test: `lib/unit-content.test.js`

**Interfaces:**
- Consumes: 無（純函式，第一個 Task）
- Produces: `buildContentFlags({ materials, games, videos })` → `Record<string, { handout: boolean, score: boolean, game: boolean, assignment: boolean }>`
  - `materials`: `Array<{ video_id: string | null, kind?: string }>`
  - `games`: `Array<{ video_id: string | null }>`
  - `videos`: `Array<{ id: string, assignment_desc?: string | null }>`
  - 回傳物件**只包含至少有一項內容的 video_id**；沒有任何內容的單元不會出現在 key 裡。

- [ ] **Step 1: 寫失敗的測試**

建立 `lib/unit-content.test.js`：

```js
import { describe, it, expect } from "vitest";
import { buildContentFlags } from "./unit-content";

const V1 = "11111111-1111-1111-1111-111111111111";
const V2 = "22222222-2222-2222-2222-222222222222";

describe("buildContentFlags", () => {
  it("沒有輸入時回空物件", () => {
    expect(buildContentFlags()).toEqual({});
    expect(buildContentFlags({})).toEqual({});
  });

  it("依 kind 分流講義與樂譜", () => {
    const flags = buildContentFlags({
      materials: [
        { video_id: V1, kind: "handout" },
        { video_id: V2, kind: "score" },
      ],
    });
    expect(flags[V1]).toEqual({ handout: true, score: false, game: false, assignment: false });
    expect(flags[V2]).toEqual({ handout: false, score: true, game: false, assignment: false });
  });

  it("kind 為 null／未知值一律當講義（對應 DB 預設與舊資料）", () => {
    const flags = buildContentFlags({
      materials: [{ video_id: V1, kind: null }, { video_id: V2, kind: "weird" }],
    });
    expect(flags[V1].handout).toBe(true);
    expect(flags[V2].handout).toBe(true);
    expect(flags[V2].score).toBe(false);
  });

  it("全課程通用講義（video_id 為 null）不產生任何單元旗標", () => {
    expect(buildContentFlags({ materials: [{ video_id: null, kind: "score" }] })).toEqual({});
  });

  it("games 設定 game 旗標，video_id 為 null 者略過", () => {
    const flags = buildContentFlags({ games: [{ video_id: V1 }, { video_id: null }] });
    expect(flags[V1].game).toBe(true);
    expect(Object.keys(flags)).toEqual([V1]);
  });

  it("assignment_desc 有實質內容才算作業", () => {
    const flags = buildContentFlags({
      videos: [
        { id: V1, assignment_desc: "彈完整首並錄影" },
        { id: V2, assignment_desc: "   " },
        { id: "33333333-3333-3333-3333-333333333333", assignment_desc: null },
      ],
    });
    expect(flags[V1].assignment).toBe(true);
    expect(Object.keys(flags)).toEqual([V1]);
  });

  it("同一單元的多種來源會合併到同一筆", () => {
    const flags = buildContentFlags({
      materials: [{ video_id: V1, kind: "handout" }, { video_id: V1, kind: "score" }],
      games: [{ video_id: V1 }],
      videos: [{ id: V1, assignment_desc: "作業" }],
    });
    expect(flags[V1]).toEqual({ handout: true, score: true, game: true, assignment: true });
  });

  it("容忍清單中的 null／缺欄位元素，不拋錯", () => {
    const flags = buildContentFlags({
      materials: [null, {}, { video_id: V1, kind: "score" }],
      games: [null, {}],
      videos: [null, {}, { id: V1 }],
    });
    expect(flags[V1]).toEqual({ handout: false, score: true, game: false, assignment: false });
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/unit-content.test.js`
Expected: FAIL — `Failed to resolve import "./unit-content"`

- [ ] **Step 3: 寫最小實作**

建立 `lib/unit-content.js`：

```js
// 由 materials / games / videos 三份清單彙整「每個單元有哪些內容」的旗標，
// 供播放頁右側單元欄直接查表顯示 icon。純函式、無 IO，由 bootstrap 在伺服器端呼叫。
// 只收錄至少有一項內容的單元；全課程通用講義（video_id 為 null）不掛在任何單元上。
export function buildContentFlags({ materials = [], games = [], videos = [] } = {}) {
  const flags = {};
  const at = (id) => (flags[id] ??= { handout: false, score: false, game: false, assignment: false });

  for (const m of materials) {
    if (!m?.video_id) continue;
    at(m.video_id)[m.kind === "score" ? "score" : "handout"] = true;
  }
  for (const g of games) {
    if (g?.video_id) at(g.video_id).game = true;
  }
  for (const v of videos) {
    if (v?.id && v.assignment_desc?.trim()) at(v.id).assignment = true;
  }
  return flags;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/unit-content.test.js`
Expected: PASS，8 passed

- [ ] **Step 5: 跑全套測試確認沒弄壞既有測試**

Run: `npm test`
Expected: 全數通過，且通過數比改動前多 8 筆

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # 必須是 feat/point2-carousel
git add lib/unit-content.js lib/unit-content.test.js
git commit -m "教室單元內容旗標純函式 buildContentFlags"
```

---

## Task 2: `materials.kind` 欄位與兩支 materials API

**Files:**
- Modify: `supabase-classroom-features.sql`（① 講義／樂譜區段，`materials_video_id_idx` 那行之後）
- Modify: `app/api/admin/materials/route.js`
- Modify: `app/api/classroom/materials/route.js`

**Interfaces:**
- Consumes: 無
- Produces:
  - DB：`materials.kind TEXT NOT NULL DEFAULT 'handout'`，值域 `'handout' | 'score'`
  - `GET /api/admin/materials` 回傳的每筆 material 多一個 `kind` 欄位
  - `POST /api/admin/materials` 接受 FormData 欄位 `kind`（缺漏或非 `'score'` 一律存 `'handout'`）
  - `GET /api/classroom/materials?video_id=…` 回傳的每筆 material 多一個 `kind` 欄位

**不得改動：** 兩支 API 的權限驗證、`validateMaterialFile` 檢查、storage 上傳／刪除順序與孤兒檔清理、`logAudit` 既有欄位、簽章模式的 `published` 檢查與 300 秒有效期、UUID 白名單正則。

- [ ] **Step 1: 加 SQL 欄位**

在 `supabase-classroom-features.sql` 中找到這行：

```sql
CREATE INDEX IF NOT EXISTS materials_video_id_idx ON materials (video_id);
```

**緊接其後**插入：

```sql
-- 講義／樂譜分類（2026-08 追加）。既有列預設為講義，行為完全不變；
-- 上線後在後台把樂譜那幾筆改成 'score' 即可。
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'handout';
```

- [ ] **Step 2: admin API GET 帶出 kind**

在 `app/api/admin/materials/route.js` 的 `GET` 中，把 select 字串改成含 `kind`：

```js
  let q = supabase
    .from("materials")
    .select("id, video_id, kind, title, storage_path, file_size, sort_order, created_at")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
```

- [ ] **Step 3: admin API POST 接受並寫入 kind**

同檔 `POST` 中，在 `const videoId = ...` 那行**之後**加一行：

```js
  // 只認 'score'，其餘（含缺漏、亂填）一律落回 'handout'，與 DB 預設一致
  const kind = formData.get("kind") === "score" ? "score" : "handout";
```

接著把 insert 改為：

```js
  const { data, error } = await supabase
    .from("materials")
    .insert({ video_id: videoId, kind, title, storage_path: path, file_size: buf.length })
    .select("id")
    .single();
```

並把稽核 meta 補上 `kind`：

```js
    meta: { title, video_id: videoId, kind }, req,
```

- [ ] **Step 4: classroom API 清單帶出 kind**

在 `app/api/classroom/materials/route.js` 的清單模式中，select 加 `kind`：

```js
  let q = supabase
    .from("materials")
    .select("id, video_id, kind, title, file_size, sort_order")
    .order("sort_order", { ascending: true });
```

並把回傳 map 補上 `kind`：

```js
  const materials = (data || []).map((m) => ({ id: m.id, title: m.title, file_size: m.file_size, video_id: m.video_id, kind: m.kind }));
```

- [ ] **Step 5: 在正式 DB 執行 SQL**

用 Supabase MCP 對專案 `vmslzbcegfljlopkewpx` 執行：

```sql
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'handout';
```

再驗證欄位存在且既有列都是 `handout`：

```sql
SELECT kind, count(*) FROM materials GROUP BY kind;
```

Expected: 只有一列 `handout | <既有筆數>`（若目前無講義則回空集合，也算通過）

- [ ] **Step 6: 驗證 build**

Run: `npm run build`
Expected: 成功，無新增錯誤

- [ ] **Step 7: Commit**

```bash
git add supabase-classroom-features.sql app/api/admin/materials/route.js app/api/classroom/materials/route.js
git commit -m "materials 加 kind 欄位區分講義與樂譜"
```

---

## Task 3: 後台上傳表單「類型」選單

**Files:**
- Modify: `app/admin/MaterialsManager.jsx`

**Interfaces:**
- Consumes: Task 2 的 `POST /api/admin/materials` FormData `kind` 欄位、`GET` 回傳的 `m.kind`
- Produces: 無（UI 終點）

**不得改動：** 上傳的檔案驗證流程、413／錯誤碼對照表、刪除確認、`load()` 的錯誤處理、`pw()` 取 token 方式。`app/admin/ChaptersUnitsPage.jsx` 傳進來的 props（`videoId` / `title` / `onClose` / `showToast`）維持不變，故該檔不需修改。

- [ ] **Step 1: 加 kind state**

在 `app/admin/MaterialsManager.jsx` 的 `const [name, setName] = useState("");` 之後加：

```jsx
  const [kind, setKind] = useState("handout");
```

- [ ] **Step 2: 上傳時帶上 kind、成功後重設**

在 `upload()` 中，`fd.append("title", name.trim());` 之後加：

```jsx
      fd.append("kind", kind);
```

並把成功分支的重設補上 `kind`：

```jsx
        showToast("✅ 已上傳");
        setFile(null); setName(""); setKind("handout");
```

- [ ] **Step 3: 表單加類型選單**

把表單第一個 `<input>`（講義名稱）那行替換為下列兩行——選單放在名稱之前，先選類型再命名比較順：

```jsx
          <select className={styles.input} value={kind} onChange={e => setKind(e.target.value)}>
            <option value="handout">講義</option>
            <option value="score">樂譜</option>
          </select>
          <input className={styles.input} placeholder={kind === "score" ? "樂譜名稱（例：小星星 簡易版）" : "講義名稱（例：第 1 課 和弦表）"} value={name} onChange={e => setName(e.target.value)} />
```

同時把 `upload()` 開頭的提示文案改成跟著類型走：

```jsx
    if (!name.trim()) { showToast(kind === "score" ? "請輸入樂譜名稱" : "請輸入講義名稱"); return; }
```

- [ ] **Step 4: 清單顯示類型標籤、標題與空狀態文案**

把 modal 標題改為：

```jsx
          <h3 style={{ margin: 0, fontSize: 18 }}>講義／樂譜 — {title}</h3>
```

空狀態改為：

```jsx
          <p style={{ color: "#94a3b8", fontSize: 14 }}>尚無講義或樂譜</p>
```

清單每一列在檔名前面加類型標籤——把 `<span style={{ flex: 1, ... }}>{m.title}</span>` 換成：

```jsx
                <span style={{
                  flexShrink: 0, fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                  background: m.kind === "score" ? "#fef3c7" : "#e0f2fe",
                  color: m.kind === "score" ? "#92400e" : "#075985",
                }}>{m.kind === "score" ? "樂譜" : "講義"}</span>
                <span style={{ flex: 1, fontSize: 14, color: "#0f172a" }}>{m.title}</span>
```

- [ ] **Step 5: 驗證 build**

Run: `npm run build`
Expected: 成功，無新增錯誤

- [ ] **Step 6: 目視確認 select 樣式**

Run: `npm run dev`，開 `http://localhost:3000/admin` → 課程管理 → 管理教室 → 任一單元的講義管理。
Expected: 類型選單與名稱輸入框同寬對齊（`styles.input` 對 `<select>` 生效）。若高度或內距明顯不一致，在 select 的 style 補 `{ height: 40 }` 對齊——**不要改 `admin.module.css`**，避免影響其他表單。

- [ ] **Step 7: Commit**

```bash
git add app/admin/MaterialsManager.jsx
git commit -m "後台講義管理加講義／樂譜類型選單"
```

---

## Task 4: 教室講義區依 kind 拆成兩組並加錨點

**Files:**
- Modify: `app/classroom/watch/page.jsx`（`MaterialsSection`，約 271–333 行，`/* ── MaterialsSection ── */` 到 `/* ── RatingTab ── */` 之間）

**Interfaces:**
- Consumes: Task 2 的 `GET /api/classroom/materials` 回傳的 `m.kind`
- Produces:
  - DOM 錨點 id：`unit-handouts`（講義組）、`unit-scores`（樂譜組）
  - 模組層級 helper `revealSection(id)`，供 Task 6 的 icon 點擊呼叫

**不得改動：** `openMaterial()` 的控制流程——先同步開空白分頁再 await 簽名 URL 的防彈窗攔截寫法、`freshToken`、`busyId` 控制、失敗時 `w.close()`，全部原樣保留。載入 effect 的 `cancelled` 競態保護也原樣保留。（唯一允許的改動是 Step 3 的錯誤**文案**，因為同一支現在也服務樂譜。）

- [ ] **Step 1: 加 revealSection helper**

在 `/* ── MaterialsSection ── */` 註解**之前**插入：

```jsx
/* 捲到指定區塊並閃一下。切換單元時該區塊要等講義載入才會出現，故短暫重試（上限約 1.4 秒）。 */
function revealSection(id, tries = 12) {
  const el = typeof document !== "undefined" ? document.getElementById(id) : null;
  if (!el) { if (tries > 0) setTimeout(() => revealSection(id, tries - 1), 120); return; }
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.animate?.([{ background: "rgba(37,99,235,0.14)" }, { background: "transparent" }], { duration: 1200 });
}
```

- [ ] **Step 2: 把 MaterialsSection 的 return 改成兩組**

把 `if (!items.length) return null;` 之後的整段 `return (…);` 替換為：

```jsx
  if (!items.length) return null;

  const groups = [
    { kind: "handout", id: "unit-handouts", label: "📎 講義下載" },
    { kind: "score",   id: "unit-scores",   label: "🎼 樂譜下載" },
  ].map(g => ({ ...g, list: items.filter(m => (m.kind === "score" ? "score" : "handout") === g.kind) }))
   .filter(g => g.list.length);

  return (
    <>
      {groups.map(g => (
        <div key={g.id} id={g.id} style={{ padding: "12px 20px", background: "#fff", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", marginBottom: 8 }}>{g.label}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {g.list.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => openMaterial(m.id)}
                disabled={busyId === m.id}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  fontSize: 13, color: "#1d4ed8",
                  background: "#eff6ff", border: "1px solid #bfdbfe",
                  borderRadius: 8, padding: "7px 12px", fontFamily: F,
                  cursor: busyId === m.id ? "default" : "pointer",
                  opacity: busyId === m.id ? 0.6 : 1,
                }}
              >
                <span style={{ color: "#dc2626", fontWeight: 700 }}>PDF</span>
                {m.title}{m.video_id ? "" : "（通用）"}
              </button>
            ))}
          </div>
        </div>
      ))}
      {/* 錯誤訊息只出現一次：兩組共用同一個 err state，放進 map 會重複顯示 */}
      {err && (
        <div style={{ padding: "0 20px 12px", background: "#fff", borderBottom: "1px solid rgba(0,0,0,0.06)", fontSize: 12, color: "#b45309" }}>
          {err}
        </div>
      )}
    </>
  );
```

- [ ] **Step 3: 錯誤訊息文案跟著類型走**

`openMaterial()` 內兩處 `setErr("講義暫時無法下載，請稍後再試")` 改為：

```jsx
setErr("檔案暫時無法下載，請稍後再試")
```

（兩處都要改。樂譜也走同一支，寫「講義」會對不上。）

- [ ] **Step 4: 驗證 build**

Run: `npm run build`
Expected: 成功，無新增錯誤

- [ ] **Step 5: 迴歸確認**

核 diff 確認：
- `openMaterial()` 的 `window.open("", "_blank", "noopener,noreferrer")` 先開分頁再 await 的順序沒被動到
- 載入 effect 的 `cancelled` 旗標與 `freshToken` 呼叫沒被動到
- 「（通用）」標記還在
- 沒有講義也沒有樂譜時仍 `return null`（整區不顯示）

- [ ] **Step 6: Commit**

```bash
git add app/classroom/watch/page.jsx
git commit -m "教室講義區依類型拆成講義／樂譜兩組並加錨點"
```

---

## Task 5: bootstrap 回傳 contentFlags

**Files:**
- Modify: `app/api/classroom/bootstrap/route.js`

**Interfaces:**
- Consumes: Task 1 的 `buildContentFlags`、Task 2 的 `materials.kind`
- Produces: `GET /api/classroom/bootstrap?player=1` 回應多一個 `contentFlags` 欄位，型別為 `Record<string, { handout, score, game, assignment }>`。**非 playerMode（儀表板）不回此欄位**，儀表板行為完全不變。

**不得改動：** `requireClassroomAuth`、`enforceDeviceLimit` 裝置上限檢查、未購課提前 return、`videoCols` 依模式切換、既有五個查詢的順序與內容、既有容錯降級（查詢失敗記 log、退回空值）。

- [ ] **Step 1: import 純函式**

在檔案頂端 import 區塊最後一行（`import { enforceDeviceLimit } from "@/lib/game-devices";`）之後加：

```js
import { buildContentFlags } from "@/lib/unit-content";
```

- [ ] **Step 2: Promise.all 加兩個查詢**

把既有的解構與陣列改為（**新增的兩項放在最後，既有五項順序不動**）：

```js
  const [chapRes, vidRes, progRes, countRes, annRes, matRes, gameRes] = await Promise.all([
    supabase.from("chapters").select("*").order("sort_order", { ascending: true }),
    supabase.from("videos").select(videoCols).eq("published", true).order("sort_order", { ascending: true }),
    supabase.from("progress").select("video_id, watched_seconds, total_seconds, completed, watched_at").eq("user_id", user.id),
    supabase.from("videos").select("id", { count: "exact", head: true }).eq("published", true),
    playerMode
      ? supabase.from("announcements").select("id, title, body, pinned, created_at").eq("published", true)
      : Promise.resolve({ data: null, error: null }),
    // 播放頁側欄的內容 icon 用：只撈索引欄位，兩張表都小，成本可忽略。
    // 通用講義（video_id 為 null）不掛單元，先在 DB 濾掉。
    playerMode
      ? supabase.from("materials").select("video_id, kind").not("video_id", "is", null)
      : Promise.resolve({ data: null, error: null }),
    playerMode
      ? supabase.from("games").select("video_id").not("video_id", "is", null)
      : Promise.resolve({ data: null, error: null }),
  ]);
```

- [ ] **Step 3: 彙整並回傳 contentFlags**

在 `out.videos = vidRes.data || [];` 那行**之後**加：

```js
  if (playerMode) {
    // 讀取失敗不讓側欄壞掉：記 log、旗標退回空物件，icon 不顯示而已（與本檔既有容錯一致）
    if (matRes.error) console.error("[bootstrap] materials:", matRes.error.message);
    if (gameRes.error) console.error("[bootstrap] games:", gameRes.error.message);
    out.contentFlags = buildContentFlags({
      materials: matRes.data || [],
      games: gameRes.data || [],
      videos: out.videos,
    });
  }
```

- [ ] **Step 4: 驗證 build**

Run: `npm run build`
Expected: 成功，無新增錯誤

- [ ] **Step 5: 實跑驗證回應**

Run: `npm run dev`，用已購課帳號登入教室進到播放頁，在瀏覽器 DevTools → Network 找 `bootstrap?player=1` 的回應。
Expected: 回應含 `contentFlags` 物件；至少一個已掛講義／遊戲／作業的單元 id 出現在 key 中且旗標為 true。

再開 `/classroom` 儀表板，確認其 `bootstrap`（無 `player=1`）回應**沒有** `contentFlags`，且頁面顯示一切正常。

- [ ] **Step 6: Commit**

```bash
git add app/api/classroom/bootstrap/route.js
git commit -m "bootstrap 播放頁模式回傳單元內容旗標"
```

---

## Task 6: 側欄加寬、標題兩行、內容 icon

**Files:**
- Modify: `app/classroom/watch/page.jsx`（模組頂端常數區；`WatchPage` state 與 bootstrap handler；側欄容器約 1464–1476 行；單元列 `cv.map` 約 1531–1589 行）

**Interfaces:**
- Consumes: Task 5 的 `d.contentFlags`、Task 4 的 `revealSection` 與錨點 id
- Produces: 無（UI 終點）

**不得改動：** 進度條區塊、章節標題樣式、狀態圈的尺寸與配色邏輯、`handleSelect`、抽屜遮罩與 `drawerOpen` 開關、`isTablet` 判斷。

- [ ] **Step 1: 加 icon 定義常數**

在模組頂端 `const F = \`var(--type-body)\`;` 那行**之後**加：

```jsx
// 側欄單元列右側的內容 icon。順序固定：先看的、再練的、最後交的——
// 位置一致，學員掃第二個單元時不用重新找。key 對應 lib/unit-content.js 的旗標。
const UNIT_ICONS = [
  { key: "handout",    emoji: "📎", label: "講義下載", anchor: "unit-handouts" },
  { key: "score",      emoji: "🎼", label: "樂譜下載", anchor: "unit-scores" },
  { key: "game",       emoji: "🎮", label: "互動遊戲", tab: "games" },
  { key: "assignment", emoji: "📝", label: "作業繳交", tab: "assignment" },
];
```

- [ ] **Step 2: 加 contentFlags state 並接上 bootstrap**

在 `WatchPage` 的 `const [announcements, setAnnouncements] = useState([]);` 之後加：

```jsx
  const [contentFlags, setContentFlags]   = useState({});
```

在 bootstrap 成功處理區塊的 `setAnnouncements(d.announcements || []);` 之後加：

```jsx
          setContentFlags(d.contentFlags || {});
```

- [ ] **Step 3: 加 icon 點擊處理**

在 `WatchPage` 內、`handleSelect` 定義之後加：

```jsx
  // 點 icon＝切到該單元＋直接開對應區塊。必須 stopPropagation，
  // 否則外層單元列的 onClick 也會跑，剛設好的分頁會被蓋掉。
  function handleIconClick(e, v, ic) {
    e.stopPropagation();
    handleSelect(v);
    if (ic.tab) setTab(ic.tab);
    else revealSection(ic.anchor);
  }
```

- [ ] **Step 4: 側欄加寬**

把側欄容器的兩組寬度改掉：

```jsx
        <div style={isTablet ? {
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: "min(380px, 88vw)", zIndex: 50,
```

以及桌機那組：

```jsx
        } : {
          width: 360,
```

- [ ] **Step 5: 改寫單元列**

把 `cv.map((v, idx) => { … })` 整段替換為下列內容。**外層由 `<button>` 改為 `<div>`，內容與 icon 各自是獨立的 `<button>`**——按鈕不能巢狀在按鈕裡，否則 HTML 不合法且鍵盤／螢幕閱讀器會壞掉：

```jsx
                  {cv.map((v, idx) => {
                    const isActive   = v.id === currentVideo?.id;
                    const pe         = progMap[v.id];
                    const done       = !!pe?.completed;
                    const watchPct   = (pe?.total_seconds > 0)
                      ? Math.min(100, Math.round((pe.watched_seconds / pe.total_seconds) * 100))
                      : 0;
                    const isWatching = !done && watchPct > 0;
                    const flags      = contentFlags[v.id];
                    const icons      = flags ? UNIT_ICONS.filter(ic => flags[ic.key]) : [];
                    const rowBg      = isActive ? "rgba(37,99,235,0.08)" : "transparent";
                    const icoBg      = isActive ? "rgba(37,99,235,0.12)" : "#f1f5f9";
                    return (
                      <div key={v.id}
                        style={{
                          display: "flex", alignItems: "flex-start",
                          borderRadius: 9, background: rowBg, transition: "background .1s",
                        }}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                      >
                        <button onClick={() => handleSelect(v)}
                          style={{
                            display: "flex", alignItems: "flex-start", gap: 10,
                            flex: 1, minWidth: 0, padding: "8px 2px 8px 6px",
                            border: 0, borderRadius: 9, background: "none", cursor: "pointer",
                            textAlign: "left", fontFamily: F,
                          }}
                        >
                          {/* Status indicator */}
                          <div style={{
                            width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                            display: "grid", placeItems: "center",
                            fontSize: 10.5, fontWeight: 600,
                            background: isActive ? "#2563eb" : done ? "rgba(22,163,74,0.12)" : isWatching ? "rgba(37,99,235,0.08)" : "#f1f5f9",
                            color: isActive ? "#fff" : done ? "#16a34a" : isWatching ? "#2563eb" : "#64748b",
                            border: `1.5px solid ${isActive ? "#2563eb" : done ? "rgba(22,163,74,0.4)" : isWatching ? "rgba(37,99,235,0.3)" : "rgba(0,0,0,0.1)"}`,
                          }}>
                            {done && !isActive ? "✓" : idx + 1}
                          </div>

                          {/* Title + progress */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 13, lineHeight: 1.45,
                              fontWeight: isActive ? 600 : 400,
                              color: isActive ? "#2563eb" : "#334155",
                              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                            }}>
                              {v.title}
                            </div>
                            {isWatching ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3 }}>
                                <div style={{ flex: 1, height: 3, background: "#e2e8f0", borderRadius: 2 }}>
                                  <div style={{ width: `${watchPct}%`, height: "100%", background: "#2563eb", borderRadius: 2 }} />
                                </div>
                                <span style={{ fontSize: 10, color: "#2563eb", flexShrink: 0 }}>{watchPct}%</span>
                              </div>
                            ) : v.duration ? (
                              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
                                {v.duration}
                              </div>
                            ) : null}
                          </div>
                        </button>

                        {/* 內容 icon：只顯示該單元真的有的，沒有就不佔位 */}
                        {icons.length > 0 && (
                          <div style={{ display: "flex", gap: 2, flexShrink: 0, padding: "9px 6px 0 0" }}>
                            {icons.map(ic => (
                              <button key={ic.key} type="button"
                                title={ic.label}
                                aria-label={`${v.title}－${ic.label}`}
                                onClick={e => handleIconClick(e, v, ic)}
                                style={{
                                  width: 24, height: 24, borderRadius: 7, border: 0,
                                  display: "grid", placeItems: "center",
                                  fontSize: 12.5, lineHeight: 1, cursor: "pointer",
                                  background: icoBg, transition: "background .12s",
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = isActive ? "rgba(37,99,235,0.2)" : "#e2e8f0"; }}
                                onMouseLeave={e => { e.currentTarget.style.background = icoBg; }}
                              >{ic.emoji}</button>
                            ))}
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

- [ ] **Step 8: Commit**

```bash
git add app/classroom/watch/page.jsx
git commit -m "播放頁側欄加寬至 360、標題兩行、單元內容 icon"
```

---

## Task 7: 迴歸驗證與 preview 部署

**Files:** 無（純驗證）

**Interfaces:**
- Consumes: Task 1–6 全部
- Produces: 可上正式站的結論

- [ ] **Step 1: 準備測試資料**

在後台「課程管理 → 管理教室」為不同單元佈置：
- A 單元：只上傳一份**講義**
- B 單元：上傳一份**講義** ＋ 一份**樂譜**，並掛一個互動遊戲、填寫作業說明（四種都有）
- C 單元：什麼都不掛
- 另上傳一份 `video_id` 為 null 的**通用講義**

- [ ] **Step 2: 新功能驗證**

在播放頁逐項確認：
- A 單元只出現 📎；B 單元出現 📎🎼🎮📝 且順序正確；C 單元完全沒有 icon 也沒有佔位空白
- 點 📎 → 切到該單元並捲到「📎 講義下載」且閃一下
- 點 🎼 → 捲到「🎼 樂譜下載」
- 點 🎮 → 切到「互動遊戲」分頁；點 📝 → 切到「作業繳交」分頁
- 點單元**文字** → 只切換單元，分頁維持原本選擇（不被切走）
- 從別的單元點 B 單元的 📎（跨單元切換）→ 講義區載入後仍正確捲到
- 通用講義出現在講義組內、帶「（通用）」標記，且**不讓任何單元長出 📎**
- 鍵盤 Tab 可走到 icon、Enter 可觸發

- [ ] **Step 3: 既有功能迴歸驗證**

這是本計畫的硬性前提，逐項確認**沒有壞掉**：
- 播放器正常播放、進度記錄與百分比照常更新
- 側欄狀態圈（未看／觀看中 %／已完成 ✓）與頂部學習進度條顯示正確
- 課程評價、作業繳交（含上傳圖片）、互動遊戲（含載入遊戲內容）、筆記四個分頁都正常
- 留言區「此單元／不分單元」切換正常
- 公告橫幅正常
- 平板／手機（≤1024px）抽屜可開關、寬度合理、點單元後自動收起
- `/classroom` 儀表板完全正常（不應有任何變化）
- 後台講義管理：上傳講義、上傳樂譜、刪除、切換單元載入清單皆正常；既有講義顯示為「講義」標籤

- [ ] **Step 4: 部署 preview 並在真機確認**

```bash
gh auth switch --user inrecmusic
git push origin feat/point2-carousel
```

依專案慣例部署 Vercel preview，用**真實課程單元標題**在手機與筆電上確認：
- 360px 下長標題斷行是否自然；若明顯不順，回報數字建議（例如改 380）再調
- emoji 在該裝置的渲染大小是否協調

Expected: 確認無誤後回報，由使用者決定何時 `npx vercel --prod` 上正式站。

- [ ] **Step 5: 回報交付摘要**

明確列出：
- 這次動到哪些檔案與哪些行為
- 哪些既有功能經過迴歸驗證、結果為何
- 正式站上線還需要做什麼（SQL 已於 Task 2 Step 5 跑過，需註明）

---

## Self-Review

**Spec coverage**

| 規格要求 | 對應 Task |
|---|---|
| 桌機 288 → 360 | Task 6 Step 4 |
| 抽屜 min(330px,85vw) → min(380px,88vw) | Task 6 Step 4 |
| 標題兩行 clamp | Task 6 Step 5 |
| 四類 icon 固定順序 📎🎼🎮📝 | Task 6 Step 1（`UNIT_ICONS` 陣列順序）＋ Step 5（`filter` 保序） |
| 點 icon 切單元＋開對應區塊 | Task 6 Step 3 |
| 點文字只切單元 | Task 6 Step 5（外層 button 維持 `handleSelect`） |
| stopPropagation | Task 6 Step 3 |
| 沒有內容就不顯示、不佔位 | Task 6 Step 5（`icons.length > 0` 條件渲染） |
| 不做 🎮 灰色升級提示 | 全計畫皆無此邏輯 |
| 通用講義不產生 icon、仍顯示在區塊內 | Task 1（`if (!m?.video_id) continue`）＋ Task 5（`.not("video_id","is",null)`）＋ Task 4（保留「（通用）」） |
| `materials.kind` 欄位帶 default | Task 2 Step 1、Step 5 |
| 後台類型選單 | Task 3 |
| 講義區拆兩組 | Task 4 Step 2 |
| bootstrap 加兩查詢、彙整 contentFlags、僅 playerMode | Task 5 |
| 容錯降級 | Task 5 Step 3 |
| aria-label／鍵盤可用 | Task 6 Step 5、Task 7 Step 2 |
| preview 真機確認才上正式站 | Task 7 Step 4 |

**Type consistency**

- 旗標 key `handout` / `score` / `game` / `assignment` 在 `lib/unit-content.js`、測試、`UNIT_ICONS` 的 `key` 三處一致。
- 錨點 id `unit-handouts` / `unit-scores` 在 Task 4 Step 2 定義、Task 6 Step 1 引用，字串一致。
- `kind` 值域 `'handout' | 'score'` 在 SQL default、admin POST 白名單、classroom API、`buildContentFlags`、MaterialsManager 五處一致。
- `revealSection(id, tries)` 在 Task 4 定義為模組層級函式，Task 6 於同檔內呼叫，作用域正確。

**Placeholder scan**：無 TBD／TODO；所有程式步驟皆附完整程式碼；所有指令皆附預期輸出。
