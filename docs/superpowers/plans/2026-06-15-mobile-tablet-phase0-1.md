# 手機/平板 UI/UX — Phase 0（地基）＋ Phase 1（教室）實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為全站建立統一的響應式地基（斷點/流體 Token/安全網），並把教室頁的平板體驗從「底部擠版清單」修正為與手機一致的抽屜式課程目錄。

**Architecture:** 沿用 CSS Modules + 流體化（方案 A）。地基寫在 `app/globals.css`。教室頁是 inline-style 架構、已有 `isPhone`/`isTablet`/`drawerOpen` 狀態與手機抽屜；Phase 1 把既有抽屜的觸發門檻由 `isPhone`（≤640）放寬到 `isTablet`（≤1024），讓平板共用同一套抽屜，並移除已不再使用的死碼 CSS。

**Tech Stack:** Next.js 14 App Router、CSS Modules、inline styles、CSS `clamp()` / `env(safe-area-inset-*)`。

**驗收方式：** 本計畫為純前端樣式，無自動視覺回歸基建；以 dev server（`npm run dev`）在瀏覽器 DevTools 裝置工具列的標準寬度 **360 / 390 / 768 / 1024 / 1280px** 人工截圖驗收。每個 Task 的「驗證」步驟即為對應的實機尺寸檢查。

**協作限制：** 與第二個 Claude session 共用工作樹，目前在 `feat/point2-carousel`。**不切換/不新建分支**；每次 commit 前 `git branch` 確認，且**只 `git add` 本計畫明確列出的路徑**，不碰 `app/api/payuni/notify/route.js`、`supabase-hardening.sql` 等他人變更。

---

## 檔案結構

| 檔案 | 角色 | 動作 |
|------|------|------|
| `app/globals.css` | 全站地基：Token、安全網、容器類 | 修改（追加，不動既有規則） |
| `app/classroom/page.jsx` | 教室主頁（inline style） | 修改：抽屜門檻 isPhone→isTablet、觸控目標 |
| `app/classroom/classroom.module.css` | 死碼（教室主體未 import） | 先驗證未被引用，再刪除 |

---

## Phase 0 — 全站地基

### Task 0.1：在 globals.css 追加流體 Token 與安全網

**Files:**
- Modify: `app/globals.css`（在 `:root { … }` 區塊末尾與檔案末尾追加）

- [ ] **Step 1：先確認 globals.css 現況**

Run: `grep -nE "container-max|tap-min|space-section|safe-area|overflow-x" app/globals.css`
Expected: 無輸出（代表這些 Token 尚未存在，可安全追加）

- [ ] **Step 2：在 `:root` 區塊末尾（`--type-numeric` 那一行之後、`}` 之前）追加 Token**

於 `app/globals.css` 的 `:root` 區塊內，`--type-numeric: …;` 之後插入：

```css

  /* ── 響應式地基 Token（2026-06 手機/平板優化）──────────────────────── */
  --container-max: 1120px;
  --container-pad: clamp(20px, 5vw, 44px);   /* 容器左右留白：手機 20 → 桌機 44 */
  --space-section: clamp(48px, 8vw, 80px);   /* 區塊上下留白：取代各頁 80↔48 硬切 */
  --tap-min: 44px;                            /* 最小觸控目標（Apple HIG）*/
```

- [ ] **Step 3：在 `globals.css` 檔案最末尾追加全域安全網**

於 `app/globals.css` 檔案最後（現有 `.content-card` 規則之後）追加：

```css

/* ── 全域安全網（2026-06 手機/平板優化）──────────────────────────────── */
/* 防橫向溢出：任何子元素超寬都不產生水平捲軸 */
html, body { overflow-x: clip; }

/* 媒體不爆寬（img 已有 max-width，補齊 video/iframe/table）*/
video, iframe, table { max-width: 100%; }

/* 觸控回饋：移除點擊藍底、保留可點元素的 active 視覺由各元件自理 */
a, button, summary, [role="button"] { -webkit-tap-highlight-color: transparent; }

/* 觸控裝置停用位移型 hover，避免「卡住」的 hover 殘留 */
@media (hover: none) {
  a:hover, button:hover { transform: none; }
}

/* 統一容器類：供各頁逐步替換零散的 .container 定義 */
.u-container {
  width: min(var(--container-max), calc(100% - var(--container-pad) * 2));
  margin-inline: auto;
}
```

- [ ] **Step 4：啟動 dev server 驗證無回歸**

Run: `npm run dev`（背景啟動後開 http://localhost:3000）
Expected: 首頁正常載入；DevTools 切 360 / 768 / 1280px，版面與改前一致、**無新增水平捲軸**。重點檢查官網方案緞帶（`right:-32px`）在 360px 不再產生水平捲動。

- [ ] **Step 5：Commit**

```bash
git branch    # 確認仍在 feat/point2-carousel，未被切換
git add app/globals.css
git commit -m "feat(rwd): 全站響應式地基 Token 與安全網

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 1 — 教室頁平板抽屜 + 觸控目標

> **前提更正**：`classroom.module.css` 為死碼；教室主體是 inline style，手機（≤640）已有抽屜。本階段把抽屜放寬到平板（≤1024），並修觸控目標。

### Task 1.1：把課程目錄抽屜由「手機限定」放寬到「手機+平板」

**背景**：`app/classroom/page.jsx` 有兩個寬度旗標：`isPhone = innerWidth ≤640`、`isTablet = innerWidth ≤1024`（phone 同時也是 tablet）。目前抽屜相關判斷全綁 `isPhone`，導致 641–1024px 的平板落到 `else` 分支＝底部全寬、`maxHeight:300` 的擠版清單。將這些判斷改用 `isTablet`，讓平板共用抽屜；桌機（>1024，`isTablet` 為 false）維持右側 288px 側欄。

**Files:**
- Modify: `app/classroom/page.jsx`（資訊列按鈕、抽屜遮罩、抽屜容器、關閉鈕四處）

- [ ] **Step 1：改「📚 課程目錄」按鈕的顯示條件（約 line 882）**

把資訊列右側的條件由 `isPhone ? (課程目錄按鈕) : currentVideo && (…)` 改為 `isTablet ?`：

找到：
```jsx
            {isPhone ? (
              <button
                onClick={() => setDrawerOpen(true)}
```
改為：
```jsx
            {isTablet ? (
              <button
                onClick={() => setDrawerOpen(true)}
```

- [ ] **Step 2：改抽屜遮罩條件（約 line 951）**

找到：
```jsx
        {isPhone && drawerOpen && (
          <div
            onClick={() => setDrawerOpen(false)}
```
改為：
```jsx
        {isTablet && drawerOpen && (
          <div
            onClick={() => setDrawerOpen(false)}
```

- [ ] **Step 3：改抽屜容器樣式分支（約 line 960）**

把右側清單容器的 `style={isPhone ? {…抽屜…} : {…底部/側欄…}}` 改為 `isTablet ?`。抽屜寬度 `min(330px, 85vw)` 對平板仍合適。

找到：
```jsx
        <div style={isPhone ? {
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: "min(330px, 85vw)", zIndex: 50,
```
改為（只改首行條件）：
```jsx
        <div style={isTablet ? {
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: "min(330px, 85vw)", zIndex: 50,
```

並把該三元運算的 `else` 分支（原 `isTablet ? "100%" : 288` 等）簡化為純桌機側欄——因為此分支現在只在桌機（`isTablet` 為 false）執行：

找到：
```jsx
        } : {
          width: isTablet ? "100%" : 288,
          maxHeight: isTablet ? 300 : "none",
          display: "flex", flexDirection: "column",
          background: "#fff", flexShrink: 0,
          borderTop: isTablet ? "1px solid rgba(0,0,0,0.07)" : "none",
        }}>
```
改為：
```jsx
        } : {
          width: 288,
          display: "flex", flexDirection: "column",
          background: "#fff", flexShrink: 0,
        }}>
```

- [ ] **Step 4：改抽屜內關閉鈕（✕）條件（約 line 982）**

找到：
```jsx
                {isPhone && (
                  <button
                    onClick={() => setDrawerOpen(false)}
```
改為：
```jsx
                {isTablet && (
                  <button
                    onClick={() => setDrawerOpen(false)}
```

- [ ] **Step 5：清掉平板專屬的底部堆疊殘留（body 與 leftCol 邊框，約 line 800–814）**

平板改用抽屜後，body 不需直向堆疊、leftCol 不需底部邊框。把 body 的 `flexDirection: isTablet ? "column" : "row"` 與 leftCol 的 `isTablet` 邊框/overflow 還原為桌機行為（左欄全寬、可捲）：

找到 body：
```jsx
      <div style={{
        flex: 1, display: "flex",
        flexDirection: isTablet ? "column" : "row",
        minHeight: 0,
        overflow: isTablet ? "visible" : "hidden",
      }}>
```
改為：
```jsx
      <div style={{
        flex: 1, display: "flex",
        flexDirection: "row",
        minHeight: 0,
        overflow: isTablet ? "visible" : "hidden",
      }}>
```

找到 leftCol：
```jsx
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          overflowY: isTablet ? "visible" : "auto",
          borderRight: isTablet ? "none" : "1px solid rgba(0,0,0,0.07)",
          borderBottom: isTablet ? "1px solid rgba(0,0,0,0.07)" : "none",
        }}>
```
改為：
```jsx
        <div style={{
          flex: 1, minWidth: 0, display: "flex", flexDirection: "column",
          overflowY: isTablet ? "visible" : "auto",
          borderRight: isTablet ? "none" : "1px solid rgba(0,0,0,0.07)",
        }}>
```

- [ ] **Step 6：驗證平板與手機抽屜、桌機側欄三態正確**

Run: dev server，DevTools 依序切 **390px（手機）/ 768px（平板直）/ 1024px（平板橫）/ 1280px（桌機）**
Expected：
- 390 / 768 / 1024px：資訊列出現「📚 課程目錄」按鈕；點開右側滑出抽屜＋半透明遮罩；可選單元、✕ 可關；**頁面無底部擠版清單、無水平捲軸**。
- 1280px：維持右側 288px 側欄，無抽屜按鈕。
- 切換單元後抽屜內容與播放器同步。

- [ ] **Step 7：Commit**

```bash
git branch    # 確認 feat/point2-carousel
git add app/classroom/page.jsx
git commit -m "fix(classroom): 平板共用課程目錄抽屜，移除底部擠版清單

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 1.2：教室觸控目標 ≥44px（分頁鈕、課程目錄鈕）

**Files:**
- Modify: `app/classroom/page.jsx`（分頁列按鈕、資訊列課程目錄按鈕）

- [ ] **Step 1：分頁列按鈕加大觸控區（約 line 928–935）**

找到分頁 `.map` 內的 button `style`：
```jsx
                style={{
                  padding: "11px 14px", fontSize: 13.5, fontWeight: tab === t.id ? 600 : 400,
```
改為（加 `minHeight: 44`、padding 上下加大）：
```jsx
                style={{
                  minHeight: 44, padding: "12px 16px", fontSize: 14, fontWeight: tab === t.id ? 600 : 400,
```

- [ ] **Step 2：課程目錄按鈕加大觸控區（約 line 884–890）**

找到：
```jsx
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "#eff6ff", border: "1.5px solid #bfdbfe",
                  color: "#1d4ed8", borderRadius: 20, padding: "6px 14px",
                  fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0,
                }}
```
改為（padding 上下加大達 ≥44px 高）：
```jsx
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "#eff6ff", border: "1.5px solid #bfdbfe",
                  color: "#1d4ed8", borderRadius: 20, padding: "10px 16px",
                  fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0,
                }}
```

- [ ] **Step 3：驗證觸控區**

Run: dev server，390 / 768px
Expected：分頁列三顆鈕、課程目錄鈕點擊區明顯加高（≥44px），手指好點；版面未因加高而破版或溢出。

- [ ] **Step 4：Commit**

```bash
git branch
git add app/classroom/page.jsx
git commit -m "fix(classroom): 分頁與課程目錄按鈕觸控區 ≥44px

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 1.3：移除死碼 classroom.module.css

**Files:**
- Delete: `app/classroom/classroom.module.css`（先驗證未被任何檔案 import）

- [ ] **Step 1：全專案搜尋是否有 import 此檔**

Run: `grep -rn "classroom.module" app components lib --include=*.jsx --include=*.js`
Expected: 無任何輸出（確認死碼）。**若有任何輸出，停止本 Task 並回報**——代表它仍被使用，不可刪。

- [ ] **Step 2：刪除檔案**

Run: `git rm app/classroom/classroom.module.css`

- [ ] **Step 3：驗證 build 不受影響**

Run: `npm run build`
Expected: build 成功，無「module not found」之類錯誤。

- [ ] **Step 4：Commit**

```bash
git branch
git commit -m "chore(classroom): 移除未使用的 classroom.module.css 死碼

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 自我檢查（spec 對照）

- spec §2.2 Token → Task 0.1 Step 2 ✅
- spec §2.3 安全網（防溢出 / 觸控回饋 / hover:none）→ Task 0.1 Step 3 ✅；44px 觸控以各元件 `min-height`/padding 達成（Task 1.2，後續階段比照）✅
- spec §2.4 容器類 `.u-container` → Task 0.1 Step 3 ✅
- spec §2.1 統一斷點 → 教室以 `isTablet`(≤1024)/`isPhone`(≤640) 對齊（Task 1.1）；CSS 檔斷點收斂屬後續各頁階段 ⏭️
- spec Phase 1 教室 → Task 1.1–1.3（已按真實程式碼更正：手機抽屜已存在，本階段補平板）✅
- **safe-area inset**：教室固定底列無、官網 sticky bar 已自帶；全域 inset 工具留待有固定底元素的頁面（Phase 4 購買 sheet）再加，本階段不需 ⏭️

## 後續階段（各自成計畫，輪到時展開）

Phase 2 互動元件 / Phase 3 官網（含 Hero 行動版重設計）/ Phase 4 購買 sheet / Phase 5 登入+內容 / Phase 6 後台。
