# 課程 Demo 體驗頁（AI 遊戲試玩）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把首頁「免費試看／課程試看」改成跳轉到獨立公開頁 `/demo`，內嵌可玩的 AI 遊戲試玩、2 分鐘倒數、常態 CTA，倒數結束後鎖住並彈出 CTA 導向 WordPress 預購。

**Architecture:** 純邏輯（倒數格式化、CTA URL 判斷）抽到 `lib/demo.js` 做 vitest 單元測試；`/demo` 為 client component，用 sandbox iframe 載入與付費內容隔離的靜態 demo 遊戲（`public/demo-game/index.html`）；首頁三個入口改連 `/demo` 並移除影片 `PreviewModal`。

**Tech Stack:** Next.js 14 App Router、React client component、CSS Modules、vitest（node 環境，純函式測試）。

## Global Constraints

- UI 文案一律繁體中文。
- CTA 文字固定「立即預購課程」（按鈕內文字排版於實作時細修，不改字義）。
- 視覺：白底 `#fff`、主色藍 `#2563eb`、些許終端機味（等寬倒數 + 閃爍游標 + 一個 mono 標籤）；不要燈號/掃描線/磷光綠。
- 倒數固定 `TRIAL_SECONDS = 120`；**不防重整**（重整即可重玩）；不得用 localStorage / cookie / 後端記錄。
- demo 遊戲必須與付費內容隔離：靜態檔 + `sandbox="allow-scripts"` iframe，**不得**碰 `games` 表或 `/api/classroom/games`。
- CTA 目標來自環境變數 `NEXT_PUBLIC_WORDPRESS_BUY_URL`；未設或空白 → CTA 顯示「即將開放」且停用（不可連到死連結）；有值 → `target="_blank" rel="noopener noreferrer"`。
- 測試：純函式用 vitest（`npx vitest run`）；React 元件無 RTL，改用 `npx next build` + 手動驗證。
- 既有慣例：client 元件第一行 `"use client"`；站內導覽用純 `<a href>`（非 next/link）；樣式用 CSS Modules。

---

## File Structure

**新增：**
- `lib/demo.js` — 純常數與純函式：`TRIAL_SECONDS`、`formatTime(s)`、`buyUrl()`。
- `lib/demo.test.js` — 上述純函式的 vitest 測試。
- `public/demo-game/index.html` — 自包含佔位 demo 遊戲（純前端，可互動）。
- `app/demo/page.jsx` — `/demo` 頁（client：倒數 + iframe + 常態 CTA + 結束 pop up）。
- `app/demo/demo.module.css` — `/demo` 樣式（白底 + 藍 + 些許終端機）。

**修改：**
- `app/page.jsx` — 三處入口改連 `/demo`；移除 `PreviewModal`（import / state / onPreviewSuccess / render）。
- `app/page.module.css` — `.btnOutline` 補 `text-decoration:none`（hero 由 `<button>` 改 `<a>`）。
- `.env.local.example`、`CLAUDE.md` — 補 `NEXT_PUBLIC_WORDPRESS_BUY_URL` 說明。

**刪除：**
- `components/PreviewModal.jsx`、`components/PreviewModal.module.css`。

---

## Task 1: 純邏輯模組 lib/demo.js（TDD）

**Files:**
- Create: `lib/demo.js`
- Test: `lib/demo.test.js`
- Modify: `.env.local.example`（補一行環境變數）

**Interfaces:**
- Produces:
  - `TRIAL_SECONDS: number`（= 120）
  - `formatTime(seconds: number): string` — 回 `"MM:SS"`，負數視為 0
  - `buyUrl(): string | null` — 讀 `process.env.NEXT_PUBLIC_WORDPRESS_BUY_URL`，去頭尾空白；空 → `null`

- [ ] **Step 1: 寫失敗測試** — Create `lib/demo.test.js`

```js
import { describe, it, expect, afterEach } from "vitest";
import { TRIAL_SECONDS, formatTime, buyUrl } from "./demo.js";

describe("TRIAL_SECONDS", () => {
  it("固定為 120", () => { expect(TRIAL_SECONDS).toBe(120); });
});

describe("formatTime（剩餘秒數 → MM:SS）", () => {
  it("120 → 02:00", () => { expect(formatTime(120)).toBe("02:00"); });
  it("107 → 01:47", () => { expect(formatTime(107)).toBe("01:47"); });
  it("60 → 01:00", () => { expect(formatTime(60)).toBe("01:00"); });
  it("5 → 00:05", () => { expect(formatTime(5)).toBe("00:05"); });
  it("0 → 00:00", () => { expect(formatTime(0)).toBe("00:00"); });
  it("負數視為 0 → 00:00", () => { expect(formatTime(-3)).toBe("00:00"); });
  it("小數無條件捨去 → 01:47", () => { expect(formatTime(107.9)).toBe("01:47"); });
});

describe("buyUrl（WordPress 預購 URL；未設回 null）", () => {
  const KEY = "NEXT_PUBLIC_WORDPRESS_BUY_URL";
  afterEach(() => { delete process.env[KEY]; });
  it("未設定 → null", () => { delete process.env[KEY]; expect(buyUrl()).toBeNull(); });
  it("空字串 → null", () => { process.env[KEY] = ""; expect(buyUrl()).toBeNull(); });
  it("純空白 → null", () => { process.env[KEY] = "   "; expect(buyUrl()).toBeNull(); });
  it("有值 → 去頭尾空白後回傳", () => {
    process.env[KEY] = "  https://shop.example.com/course  ";
    expect(buyUrl()).toBe("https://shop.example.com/course");
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run lib/demo.test.js`
Expected: FAIL（`Failed to resolve import "./demo.js"` 或 `formatTime is not a function`）

- [ ] **Step 3: 實作 lib/demo.js** — Create `lib/demo.js`

```js
// 課程 Demo 體驗頁（/demo）的純常數與純函式，供元件與單元測試共用。
// 注意：buyUrl 用字面量 process.env.NEXT_PUBLIC_WORDPRESS_BUY_URL，
// 讓 Next.js 在 client bundle 編譯期能靜態替換。

export const TRIAL_SECONDS = 120;

// 剩餘秒數 → "MM:SS"；負數與小數安全處理（負數視為 0、小數捨去）
export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// WordPress 預購 URL；未設定或空白 → null（CTA 顯示「即將開放」停用）
export function buyUrl() {
  const url = (process.env.NEXT_PUBLIC_WORDPRESS_BUY_URL || "").trim();
  return url ? url : null;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run lib/demo.test.js`
Expected: PASS（14 個測試全過）

- [ ] **Step 5: 補環境變數範例** — Modify `.env.local.example`，在檔尾加一行

```
# 課程 Demo 體驗頁 CTA → WordPress 預購頁（未設則 CTA 顯示「即將開放」停用）
NEXT_PUBLIC_WORDPRESS_BUY_URL=
```

- [ ] **Step 6: Commit**

```bash
git add lib/demo.js lib/demo.test.js .env.local.example
git commit -m "feat(demo): lib/demo.js 純函式（formatTime / buyUrl）+ 測試"
```

---

## Task 2: 佔位 Demo 遊戲 public/demo-game/index.html

**Files:**
- Create: `public/demo-game/index.html`

**Interfaces:**
- Produces: 可由 `/demo-game/index.html` 公開存取的自包含互動頁（無外部資源、無 same-origin 需求，可在 `sandbox="allow-scripts"` 下運作）。

- [ ] **Step 1: 建立佔位遊戲** — Create `public/demo-game/index.html`

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>InRecord AI 遊戲試玩</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;font-family:system-ui,"PingFang TC","Microsoft JhengHei",sans-serif}
  html,body{height:100%}
  body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;background:#f8fafc;color:#0f172a;user-select:none}
  .hint{font-size:15px;color:#475569}
  .score{font-size:14px;color:#2563eb;font-weight:700}
  .keys{display:flex;gap:8px}
  .key{width:54px;height:150px;border:1px solid #e2e8f0;border-radius:0 0 8px 8px;background:#fff;box-shadow:0 3px 8px rgba(15,23,42,.08);cursor:pointer;transition:transform .05s,background .15s;display:flex;align-items:flex-end;justify-content:center;padding-bottom:12px;font-size:13px;color:#94a3b8}
  .key:active{transform:translateY(3px)}
  .key.target{background:#2563eb;color:#fff;box-shadow:0 6px 18px rgba(37,99,235,.45)}
</style>
</head>
<body>
  <div class="hint">🎹 點亮的鍵就是目標，依序彈奏！</div>
  <div class="score">得分：<span id="score">0</span></div>
  <div class="keys" id="keys"></div>
<script>
  var NOTES=[["C",261.63],["D",293.66],["E",329.63],["F",349.23],["G",392.00],["A",440.00],["B",493.88]];
  var keysEl=document.getElementById("keys");
  var scoreEl=document.getElementById("score");
  var score=0, target=0, ac=null;
  NOTES.forEach(function(n,i){
    var k=document.createElement("div");
    k.className="key"; k.textContent=n[0]; k.dataset.i=i;
    k.addEventListener("click",function(){ play(n[1]); hit(i); });
    keysEl.appendChild(k);
  });
  function render(){
    [].forEach.call(keysEl.children,function(k,i){ k.classList.toggle("target", i===target); });
  }
  function nextTarget(){ var t; do{ t=Math.floor(Math.random()*NOTES.length); }while(t===target&&NOTES.length>1); target=t; render(); }
  function hit(i){ if(i===target){ score++; scoreEl.textContent=score; nextTarget(); } }
  function play(freq){
    try{
      ac=ac||new (window.AudioContext||window.webkitAudioContext)();
      var o=ac.createOscillator(), g=ac.createGain();
      o.type="sine"; o.frequency.value=freq; o.connect(g); g.connect(ac.destination);
      g.gain.setValueAtTime(0.0001,ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25,ac.currentTime+0.01);
      g.gain.exponentialRampToValueAtTime(0.0001,ac.currentTime+0.5);
      o.start(); o.stop(ac.currentTime+0.5);
    }catch(e){}
  }
  render();
</script>
</body>
</html>
```

- [ ] **Step 2: 手動驗證可載入且可互動**

Run: `npx next dev`（另開終端機），瀏覽 `http://localhost:3000/demo-game/index.html`
Expected: 看到 7 個琴鍵、一個藍色「目標鍵」；點對的鍵會發音、得分 +1 並換下一個目標。確認後 `Ctrl+C` 關閉 dev。

- [ ] **Step 3: Commit**

```bash
git add public/demo-game/index.html
git commit -m "feat(demo): 佔位 AI 遊戲（自包含、可在 sandbox iframe 運作）"
```

---

## Task 3: /demo 體驗頁 app/demo/page.jsx + 樣式

**Files:**
- Create: `app/demo/page.jsx`
- Create: `app/demo/demo.module.css`

**Interfaces:**
- Consumes: `lib/demo.js` 的 `TRIAL_SECONDS`、`formatTime`、`buyUrl`；靜態 `/demo-game/index.html`（Task 2）。
- Produces: 公開路由 `/demo`。

- [ ] **Step 1: 建立頁面元件** — Create `app/demo/page.jsx`

```jsx
"use client";
import { useState, useEffect } from "react";
import { TRIAL_SECONDS, formatTime, buyUrl } from "@/lib/demo";
import styles from "./demo.module.css";

// CTA：有 URL → 新分頁連結；無 → 顯示「即將開放」停用
function Cta({ url, className, children }) {
  if (!url) {
    return <span className={`${className} ${styles.ctaDisabled}`} aria-disabled="true">即將開放</span>;
  }
  return <a className={className} href={url} target="_blank" rel="noopener noreferrer">{children}</a>;
}

export default function DemoPage() {
  const [secondsLeft, setSecondsLeft] = useState(TRIAL_SECONDS);
  const ended = secondsLeft <= 0;
  const url = buyUrl();

  useEffect(() => {
    if (ended) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [ended]);

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <div className={styles.logo}>InRec<span>●</span>rd</div>
        <div className={styles.barRight}>
          <span className={`${styles.timer} ${ended ? styles.timerEnded : ""}`}>
            ▸ {formatTime(secondsLeft)}<span className={styles.cursor}>▌</span>
          </span>
          <Cta url={url} className={styles.ctaBtn}>立即預購課程</Cta>
        </div>
      </header>

      <main className={styles.stage}>
        <span className={styles.tag}>// ai_game · live demo</span>
        <iframe
          className={`${styles.game} ${ended ? styles.gameLocked : ""}`}
          src="/demo-game/index.html"
          title="AI 遊戲試玩"
          sandbox="allow-scripts"
        />
        {ended && (
          <div className={styles.overlay}>
            <div className={styles.popup}>
              <div className={styles.popupTag}>▸ trial_ended</div>
              <div className={styles.popupTitle}>試玩結束！</div>
              <p className={styles.popupBody}>預購完整版，解鎖<br />全部 AI 遊戲 + 10 章節完整課程</p>
              <Cta url={url} className={styles.popupCta}>立即預購課程 →</Cta>
              <button className={styles.replayBtn} onClick={() => window.location.reload()}>↻ 重新試玩</button>
            </div>
          </div>
        )}
      </main>

      <footer className={styles.foot}>
        試玩 2 分鐘 · 預購完整版解鎖 <b>全部 AI 遊戲 + 10 章節完整課程</b>
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: 建立樣式** — Create `app/demo/demo.module.css`

```css
.page { min-height: 100vh; display: flex; flex-direction: column; background: #fff; color: #0f172a; }

/* 頂部列 */
.bar { display: flex; align-items: center; justify-content: space-between; padding: 13px 18px; background: #fff; border-bottom: 1px solid #eef1f5; }
.logo { font-weight: 800; font-size: 17px; letter-spacing: .3px; }
.logo span { color: #2563eb; }
.barRight { display: flex; align-items: center; gap: 14px; }
.timer { display: inline-flex; align-items: center; gap: 2px; font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-weight: 700; font-size: 14px; color: #2563eb; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 6px 12px; }
.timerEnded { color: #94a3b8; background: #f1f5f9; border-color: #e2e8f0; }
.cursor { animation: blink 1.05s steps(1) infinite; }
.timerEnded .cursor { display: none; }
@keyframes blink { 50% { opacity: 0; } }

/* CTA 按鈕（藍實心） */
.ctaBtn { background: #2563eb; color: #fff; border: none; border-radius: 9px; padding: 10px 20px; font-weight: 700; font-size: 14px; cursor: pointer; text-decoration: none; box-shadow: 0 2px 8px rgba(37,99,235,.28); white-space: nowrap; }
.ctaBtn:hover { background: #1d4ed8; }
.ctaDisabled { background: #e2e8f0 !important; color: #94a3b8 !important; box-shadow: none !important; cursor: not-allowed; pointer-events: none; }

/* 遊戲區 */
.stage { position: relative; flex: 1; background: #f8fafc; display: flex; }
.tag { position: absolute; top: 12px; left: 16px; z-index: 2; font-family: ui-monospace, Menlo, monospace; font-size: 12px; color: #94a3b8; pointer-events: none; }
.game { flex: 1; width: 100%; border: 0; background: transparent; }
.gameLocked { filter: blur(6px); pointer-events: none; }

/* 結束遮罩 + pop up */
.overlay { position: absolute; inset: 0; background: rgba(248,250,252,.6); display: grid; place-items: center; z-index: 3; }
.popup { width: min(340px, 90vw); background: #fff; border: 1px solid #e6eaf0; border-radius: 16px; padding: 26px 22px; text-align: center; box-shadow: 0 24px 60px rgba(15,23,42,.18); }
.popupTag { font-family: ui-monospace, Menlo, monospace; font-size: 12px; color: #2563eb; margin-bottom: 10px; }
.popupTitle { font-size: 19px; font-weight: 800; margin-bottom: 8px; }
.popupBody { font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 20px; }
.popupCta { display: block; width: 100%; background: #2563eb; color: #fff; border: none; border-radius: 11px; padding: 13px; font-weight: 700; font-size: 15px; cursor: pointer; text-decoration: none; box-shadow: 0 4px 14px rgba(37,99,235,.32); margin-bottom: 9px; }
.popupCta:hover { background: #1d4ed8; }
.replayBtn { width: 100%; background: #fff; color: #475569; border: 1px solid #e2e8f0; border-radius: 11px; padding: 11px; font-weight: 600; font-size: 14px; cursor: pointer; }
.replayBtn:hover { border-color: #cbd5e1; }

/* 底部 */
.foot { padding: 12px 18px; background: #fff; border-top: 1px solid #eef1f5; text-align: center; color: #64748b; font-size: 13px; }
.foot b { color: #2563eb; }

@media (max-width: 560px) {
  .bar { flex-wrap: wrap; gap: 10px; }
  .ctaBtn { padding: 9px 16px; }
}
```

- [ ] **Step 3: 編譯驗證**

Run: `npx next build`
Expected: `✓ Compiled successfully`，輸出路由清單含 `/demo`。

- [ ] **Step 4: 手動驗證流程**

Run: `npx next dev`，瀏覽 `http://localhost:3000/demo`
Expected:
- 頂部列：logo、藍色等寬倒數 `▸ 02:00▌`（游標閃爍）、藍色「立即預購課程」CTA。
- 中間 iframe 顯示 Task 2 的琴鍵遊戲、左上 `// ai_game · live demo`。
- 倒數遞減；要快速驗結束狀態，可暫時把 `lib/demo.js` 的 `TRIAL_SECONDS` 改 5、存檔、HMR 後觀察：歸零 → 遊戲模糊鎖住 + 中央 pop up（「立即預購課程 →」+「↻ 重新試玩」），CTA 因尚未設 env 顯示「即將開放」停用。**驗完把 TRIAL_SECONDS 改回 120**。
- 按「↻ 重新試玩」→ 頁面重載、倒數回到 02:00、可重玩。
關閉 dev。

- [ ] **Step 5: Commit**

```bash
git add app/demo/page.jsx app/demo/demo.module.css
git commit -m "feat(demo): /demo 體驗頁（倒數 + iframe 試玩 + 常態 CTA + 結束 pop up）"
```

---

## Task 4: 首頁入口改連 /demo + 移除 PreviewModal

**Files:**
- Modify: `app/page.jsx`（line 16 / 369 / 458 / 476 / 493 / 562-565 / 844）
- Modify: `app/page.module.css`（`.btnOutline` 補 `text-decoration`）
- Delete: `components/PreviewModal.jsx`、`components/PreviewModal.module.css`

**Interfaces:**
- Consumes: 新路由 `/demo`（Task 3）。

- [ ] **Step 1: 移除 PreviewModal import**（`app/page.jsx` line 16）

刪除這一行：
```jsx
import PreviewModal from "@/components/PreviewModal";
```

- [ ] **Step 2: 移除 previewOpen state**（line 369）

刪除這一行：
```jsx
  const [previewOpen, setPreviewOpen] = useState(false);
```

- [ ] **Step 3: 移除 onPreviewSuccess**（line 458）

刪除這一行：
```jsx
  function onPreviewSuccess() { setPreviewOpen(false); }
```

- [ ] **Step 4: 導覽列「課程試看」改連 /demo**（line 476）

把：
```jsx
            <a href="#" onClick={e => { e.preventDefault(); setPreviewOpen(true); }}>課程試看</a>
```
改為：
```jsx
            <a href="/demo">課程試看</a>
```

- [ ] **Step 5: 手機選單「課程試看」改連 /demo**（line 493）

把：
```jsx
            <a href="#" onClick={e => { e.preventDefault(); setMenuOpen(false); setPreviewOpen(true); }}>課程試看</a>
```
改為：
```jsx
            <a href="/demo" onClick={() => setMenuOpen(false)}>課程試看</a>
```

- [ ] **Step 6: hero「免費試看」由 button 改 a→/demo**（line 562-565）

把：
```jsx
                  <button className={styles.btnOutline} onClick={() => setPreviewOpen(true)}>
                    <Play size={16} />免費試看
                  </button>
```
改為：
```jsx
                  <a href="/demo" className={styles.btnOutline}>
                    <Play size={16} />免費試看
                  </a>
```

- [ ] **Step 7: 移除 PreviewModal render**（line 844）

刪除這一行：
```jsx
      <PreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} onSuccess={onPreviewSuccess} />
```

- [ ] **Step 8: .btnOutline 補 text-decoration**（`app/page.module.css` line 35）

把 `.btnOutline { ... cursor: pointer; transition: .2s; }` 規則內補 `text-decoration: none;`，例如將：
```css
.btnOutline { display: inline-flex; align-items: center; gap: 8px; border: 1.5px solid rgba(255,255,255,.55); border-radius: var(--radius-sm); padding: 12px 22px; font-weight: 600; font-size: 15px; background: transparent; color: white; cursor: pointer; transition: .2s; }
```
改為（結尾加 `text-decoration: none;`）：
```css
.btnOutline { display: inline-flex; align-items: center; gap: 8px; border: 1.5px solid rgba(255,255,255,.55); border-radius: var(--radius-sm); padding: 12px 22px; font-weight: 600; font-size: 15px; background: transparent; color: white; cursor: pointer; transition: .2s; text-decoration: none; }
```

- [ ] **Step 9: 刪除 PreviewModal 檔案**

```bash
git rm components/PreviewModal.jsx components/PreviewModal.module.css
```

- [ ] **Step 10: 確認無殘留引用**

Run: `grep -rn "PreviewModal" app components --include="*.jsx" --include="*.js"`
Expected: 只剩 `app/admin/GamesManagePage.jsx` 內**小寫** `previewModal`（後台遊戲預覽的區域 state，與本元件無關）。**不得**再出現 `import PreviewModal` 或 `<PreviewModal`。

- [ ] **Step 11: 編譯驗證**

Run: `npx next build`
Expected: `✓ Compiled successfully`，無 `PreviewModal` 未定義錯誤。

- [ ] **Step 12: 手動驗證入口**

Run: `npx next dev`，瀏覽 `http://localhost:3000/`
Expected: 點 hero「免費試看」、導覽列與手機選單「課程試看」皆導到 `/demo`；hero 按鈕外觀與原本一致（無底線、icon 對齊）。關閉 dev。

- [ ] **Step 13: Commit**

```bash
git add app/page.jsx app/page.module.css
git commit -m "feat(demo): 首頁試看入口改連 /demo + 移除影片 PreviewModal"
```

---

## Task 5: 文件補充 + 最終全量驗證

**Files:**
- Modify: `CLAUDE.md`（環境變數區補一行）

- [ ] **Step 1: CLAUDE.md 環境變數補充**

在 `CLAUDE.md` 的「環境變數」程式碼區塊末端（`KV_REST_API_TOKEN` 之後）加一行：
```
NEXT_PUBLIC_WORDPRESS_BUY_URL   # /demo 體驗頁 CTA → WordPress 預購頁；未設則 CTA 顯示「即將開放」停用
```

- [ ] **Step 2: 全量單元測試**

Run: `npx vitest run`
Expected: 全部通過（既有 270 + 本次 demo 測試），無失敗。

- [ ] **Step 3: 正式 build**

Run: `npx next build`
Expected: `✓ Compiled successfully`，路由清單含 `/demo`。

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(demo): 補 NEXT_PUBLIC_WORDPRESS_BUY_URL 環境變數說明"
```

---

## 後續（不在本計畫，需使用者提供/決定）

- 提供正式 `NEXT_PUBLIC_WORDPRESS_BUY_URL`（WordPress 預購頁 URL），設到 Vercel Production env 後重新部署，CTA 才會啟用。
- 用正式 demo 遊戲 HTML 取代 `public/demo-game/index.html` 佔位版。
- 「立即預購課程」按鈕內文字排版細修（使用者備註）。
- 部署：依現有流程 `npx vercel --prod`（會連同其他已 commit 變更一起上線，部署前確認工作區狀態）。
