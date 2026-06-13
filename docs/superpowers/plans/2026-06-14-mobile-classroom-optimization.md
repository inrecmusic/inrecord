# 手機教室 (Classroom) 優化 — 課程目錄抽屜 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 手機（≤640px）把課程目錄改為從右側滑入的抽屜、添加 16:9 播放器比例與 iOS 防放大 CSS；平板（641–1024）與桌機（>1024）維持現況不變。

**Architecture:** 全在 `app/classroom/page.jsx` 的 inline style 做。新增 `isPhone`（≤640）旗標與 `drawerOpen` state，手機時右欄改 `position:fixed` 抽屜，info bar 右側改成「📚 課程目錄」開啟鈕；backdrop（fixed overlay）在 `isPhone && drawerOpen` 時渲染。所有手機分支以 `isPhone ?` 三元判斷，確保非手機路徑的 inline style 與現況完全相同。

**Tech Stack:** React（`useState`、`useEffect`），Next.js App Router Client Component，無新依賴。`classroom.module.css` 為死檔，本計畫**不觸碰**。

**驗收說明（取代單元測試）：** 純 UI layout 無法單元測試。每個 Task 的驗證＝`npm run build` 編譯通過 + 於 dev server DevTools 指定寬度目視。

**一次性前置：確認分支**
```bash
cd "/Users/zhoubolong/Desktop/Claude code/inrecord"
git branch
# 應在 mobile-ux-classroom
```

---

## File Structure

- **Modify only:** `app/classroom/page.jsx`（1047 行，inline style）

---

## Task 1: 新增 isPhone / drawerOpen 狀態 + handleSelect 關閉抽屜 + 16px iOS 防放大 CSS

**Files:**
- Modify: `app/classroom/page.jsx`（line 513–519、650、727–733）

- [ ] **Step 1: 在 isTablet resize effect 內新增 isPhone 和 drawerOpen state**

找到以下現有程式碼（約 513–519 行）：

```jsx
  const [isTablet, setIsTablet]           = useState(false);
  useEffect(() => {
    const check = () => setIsTablet(window.innerWidth <= 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
```

替換為：

```jsx
  const [isTablet, setIsTablet]           = useState(false);
  const [isPhone, setIsPhone]             = useState(false);
  const [drawerOpen, setDrawerOpen]       = useState(false);
  useEffect(() => {
    const check = () => {
      setIsTablet(window.innerWidth <= 1024);
      setIsPhone(window.innerWidth <= 640);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
```

- [ ] **Step 2: 修改 handleSelect 在手機選課後自動關閉抽屜**

找到以下現有程式碼（約 650–652 行）：

```jsx
  function handleSelect(v) {
    setCurrentVideo(v);
  }
```

替換為：

```jsx
  function handleSelect(v) {
    setCurrentVideo(v);
    if (isPhone) setDrawerOpen(false);
  }
```

- [ ] **Step 3: 在既有 `<style>` 區塊內新增 16px media query（防 iOS 聚焦放大）**

找到以下現有程式碼（約 727–733 行）：

```jsx
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        *, *::before, *::after { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 10px; }
      `}</style>
```

替換為：

```jsx
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        *, *::before, *::after { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 10px; }
        @media (max-width: 640px) {
          input, textarea, select { font-size: 16px !important; }
        }
      `}</style>
```

- [ ] **Step 4: build 驗證**

```bash
cd "/Users/zhoubolong/Desktop/Claude code/inrecord" && npm run build
```

Expected: 編譯成功，無 TS/ESLint 錯誤。（此步驟無視覺變化，僅確認新 state 語法正確）

- [ ] **Step 5: Commit**

```bash
git add app/classroom/page.jsx
git commit -m "feat(classroom): 新增 isPhone/drawerOpen state、handleSelect 自動關閉、16px 防 iOS 放大

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 手機播放器比例 44% → 56.25%（三處）

**Files:**
- Modify: `app/classroom/page.jsx`（lines 810、825、835）

背景：三個播放器容器各有 `paddingTop: "44%"`（約 2.2:1 寬螢幕比例）。手機改為 16:9 標準比（`56.25%`）使影片更大、字幕更清楚。桌機/平板維持 44%。

- [ ] **Step 1: 修改第 1 個 paddingTop（Bunny 播放器，約 810 行）**

找到：

```jsx
              <div style={{ paddingTop: "44%", position: "relative", background: "#000" }}>
                {embedSrc ? (
```

替換為：

```jsx
              <div style={{ paddingTop: isPhone ? "56.25%" : "44%", position: "relative", background: "#000" }}>
                {embedSrc ? (
```

- [ ] **Step 2: 修改第 2 個 paddingTop（Vimeo 播放器，約 825 行）**

找到：

```jsx
              <div style={{ paddingTop: "44%", position: "relative" }}>
                <iframe
                  id="vimeo-player"
```

替換為：

```jsx
              <div style={{ paddingTop: isPhone ? "56.25%" : "44%", position: "relative" }}>
                <iframe
                  id="vimeo-player"
```

- [ ] **Step 3: 修改第 3 個 paddingTop（空白佔位播放器，約 835 行）**

找到：

```jsx
              <div style={{ paddingTop: "44%", position: "relative", background: "#0A0A0A" }}>
                <div style={{
                  position: "absolute", inset: 0,
                  display: "flex", flexDirection: "column",
```

替換為：

```jsx
              <div style={{ paddingTop: isPhone ? "56.25%" : "44%", position: "relative", background: "#0A0A0A" }}>
                <div style={{
                  position: "absolute", inset: 0,
                  display: "flex", flexDirection: "column",
```

- [ ] **Step 4: build 驗證**

```bash
cd "/Users/zhoubolong/Desktop/Claude code/inrecord" && npm run build
```

Expected: 編譯成功。

- [ ] **Step 5: 目視驗收（dev server）**

啟動 dev server：`npm run dev`，開 http://localhost:3000/classroom（需已登入）。

- DevTools 寬度 375：播放器區塊高度明顯比改版前高（16:9 = 約 211px，原 44% 約 165px）。
- DevTools 寬度 1280：播放器高度與改版前相同（44%）。

- [ ] **Step 6: Commit**

```bash
git add app/classroom/page.jsx
git commit -m "feat(classroom): 手機播放器比例改為 16:9（56.25%），桌機/平板維持 44%

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Info bar 右側：手機顯示「📚 課程目錄」開啟鈕

**Files:**
- Modify: `app/classroom/page.jsx`（lines 873–891，info bar 右側區塊）

背景：目前 info bar 右側是「✓ 已完成」或「觀看中 X%」，只在 `currentVideo` 存在時顯示。手機改為永遠顯示「📚 課程目錄 x/y」按鈕（取代進度顯示，避免窄螢幕過擠）；非手機維持原狀。

- [ ] **Step 1: 替換 info bar 右側整塊條件渲染**

找到以下現有程式碼（約 873–891 行，`{currentVideo && (` 開始的整段）：

```jsx
            {currentVideo && (
              isDone ? (
                <div style={{
                  display: "flex", alignItems: "center", gap: 5,
                  fontSize: 12, fontWeight: 600, color: "#16a34a",
                  background: "rgba(22,163,74,0.1)", padding: "6px 16px", borderRadius: 980, flexShrink: 0,
                }}>
                  ✓ 已完成
                </div>
              ) : currentWatchPct > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: "#2563eb", fontWeight: 600 }}>觀看中 {currentWatchPct}%</span>
                  <div style={{ width: 64, height: 3, background: "#e2e8f0", borderRadius: 2 }}>
                    <div style={{ width: `${currentWatchPct}%`, height: "100%", background: "#2563eb", borderRadius: 2, transition: "width .4s" }} />
                  </div>
                </div>
              ) : null
            )}
```

替換為：

```jsx
            {isPhone ? (
              <button
                onClick={() => setDrawerOpen(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "#eff6ff", border: "1.5px solid #bfdbfe",
                  color: "#1d4ed8", borderRadius: 20, padding: "6px 14px",
                  fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0,
                }}
              >
                📚 課程目錄 {doneCount}/{totalCount}
              </button>
            ) : currentVideo && (
              isDone ? (
                <div style={{
                  display: "flex", alignItems: "center", gap: 5,
                  fontSize: 12, fontWeight: 600, color: "#16a34a",
                  background: "rgba(22,163,74,0.1)", padding: "6px 16px", borderRadius: 980, flexShrink: 0,
                }}>
                  ✓ 已完成
                </div>
              ) : currentWatchPct > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: "#2563eb", fontWeight: 600 }}>觀看中 {currentWatchPct}%</span>
                  <div style={{ width: 64, height: 3, background: "#e2e8f0", borderRadius: 2 }}>
                    <div style={{ width: `${currentWatchPct}%`, height: "100%", background: "#2563eb", borderRadius: 2, transition: "width .4s" }} />
                  </div>
                </div>
              ) : null
            )}
```

- [ ] **Step 2: build 驗證**

```bash
cd "/Users/zhoubolong/Desktop/Claude code/inrecord" && npm run build
```

Expected: 編譯成功。

- [ ] **Step 3: 目視驗收（dev server）**

- DevTools 375：info bar 右側出現「📚 課程目錄 x/y」藍色按鈕；點按**尚無任何反應**（抽屜在 Task 4 才實作，drawerOpen=true 後右欄還是 static）。
- DevTools 1280：info bar 右側仍為原本的「✓ 已完成」或「觀看中 %」（無按鈕）。

- [ ] **Step 4: Commit**

```bash
git add app/classroom/page.jsx
git commit -m "feat(classroom): 手機 info bar 右側改為課程目錄開啟鈕

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Backdrop + 右欄抽屜樣式 + ✕ 關閉鈕

**Files:**
- Modify: `app/classroom/page.jsx`（lines 929–936、939–944、插入 backdrop）

這是主要的抽屜實作。三個子步驟：
1. 在右欄 div 前插入 backdrop（手機+抽屜開啟時才渲染）。
2. 右欄 div 的 style 改為 isPhone 時走抽屜樣式。
3. 在右欄內的進度標題列右側加 ✕ 關閉鈕。

- [ ] **Step 1: 在右欄 div 前插入 backdrop**

找到以下現有程式碼（約 929–930 行，右欄 div 的開頭）：

```jsx
        {/* ── Right: chapter list ── */}
        <div style={{
          width: isTablet ? "100%" : 288,
```

在該行**之前**插入 backdrop：

```jsx
        {/* ── Right: chapter list ── */}
        {isPhone && drawerOpen && (
          <div
            onClick={() => setDrawerOpen(false)}
            style={{
              position: "fixed", inset: 0,
              background: "rgba(0,0,0,.4)", zIndex: 49,
            }}
          />
        )}
        <div style={{
          width: isTablet ? "100%" : 288,
```

- [ ] **Step 2: 把右欄 div 的 style 改為手機走抽屜**

找到右欄 div 的現有 style（約 930–936 行）：

```jsx
        <div style={{
          width: isTablet ? "100%" : 288,
          maxHeight: isTablet ? 300 : "none",
          display: "flex", flexDirection: "column",
          background: "#fff", flexShrink: 0,
          borderTop: isTablet ? "1px solid rgba(0,0,0,0.07)" : "none",
        }}>
```

替換為：

```jsx
        <div style={isPhone ? {
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: "min(330px, 85vw)", zIndex: 50,
          display: "flex", flexDirection: "column",
          background: "#fff", flexShrink: 0,
          boxShadow: "-8px 0 32px rgba(0,0,0,.18)",
          transform: drawerOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform .28s ease",
        } : {
          width: isTablet ? "100%" : 288,
          maxHeight: isTablet ? 300 : "none",
          display: "flex", flexDirection: "column",
          background: "#fff", flexShrink: 0,
          borderTop: isTablet ? "1px solid rgba(0,0,0,0.07)" : "none",
        }}>
```

- [ ] **Step 3: 在進度標題列右側加 ✕ 關閉鈕（手機才顯示）**

找到進度標題列現有程式碼（約 940–943 行）：

```jsx
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 500, marginBottom: 9 }}>
              <span style={{ color: "#64748b" }}>學習進度</span>
              <span style={{ color: "#2563eb", fontWeight: 600 }}>{doneCount} / {totalCount} 完成</span>
            </div>
```

替換為：

```jsx
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, fontWeight: 500, marginBottom: 9 }}>
              <span style={{ color: "#64748b" }}>學習進度</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: "#2563eb", fontWeight: 600 }}>{doneCount} / {totalCount} 完成</span>
                {isPhone && (
                  <button
                    onClick={() => setDrawerOpen(false)}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      fontSize: 18, color: "#64748b", lineHeight: 1, padding: "2px 4px",
                    }}
                  >✕</button>
                )}
              </div>
            </div>
```

- [ ] **Step 4: build 驗證**

```bash
cd "/Users/zhoubolong/Desktop/Claude code/inrecord" && npm run build
```

Expected: 編譯成功。

- [ ] **Step 5: 全功能目視驗收**

啟動 dev server：`npm run dev`，登入已購買帳號進入 `/classroom`。

**手機 375 / 390（DevTools）：**
- info bar 右側：「📚 課程目錄 x/y」按鈕可見。
- 點按鈕 → 右側抽屜從右邊滑入（`.28s transition`），背景出現半透明遮罩。
- 抽屜頂部：「學習進度・x / y 完成」 + 右側「✕」按鈕。
- 抽屜可捲動章節清單（高度填滿螢幕）。
- 點某個單元按鈕 → 抽屜自動關閉，播放器換片。
- 點 ✕ 按鈕 → 抽屜關閉。
- 點遮罩區域 → 抽屜關閉。
- 播放器高度約 211px（16:9）。
- 聚焦留言輸入框 → 頁面**不自動放大**（iOS font-size:16px 效果）。

**小手機 360（DevTools）：**
- 抽屜寬度 = 85vw（約 306px），不破版。
- 章節清單可上下捲動。

**平板 768 / 1024（DevTools）：**
- 不出現「📚 課程目錄」按鈕（info bar 右側維持原本進度顯示）。
- 課程目錄堆疊在播放器+分頁下方、`maxHeight:300`，與改版前一致。

**桌機 1280（DevTools）：**
- 右側 288px 固定側欄，與改版前**無視覺差異**。
- info bar 右側仍為「✓ 已完成」或「觀看中 %」。

- [ ] **Step 6: Commit**

```bash
git add app/classroom/page.jsx
git commit -m "feat(classroom): 手機課程目錄抽屜（右滑入、backdrop、✕關閉）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: 全寬度回歸驗收 + build

**Files:** 無（純驗證）

- [ ] **Step 1: 完整 build 測試**

```bash
cd "/Users/zhoubolong/Desktop/Claude code/inrecord" && npm run build
```

Expected: 編譯成功、無警告升為錯誤。

- [ ] **Step 2: 桌機與平板回歸確認**

dev server 寬度 1280 與 768，確認：
- 課程目錄（右欄）位置、寬度與改版前完全相同。
- 播放器比例 44%（不是 16:9）。
- info bar 無「📚」按鈕。
- hover、分頁切換（課程評價/作業繳交/互動遊戲）皆正常。

- [ ] **Step 3: 手機總驗收**

DevTools 寬度 375，走一遍完整流程：
1. 頁面載入 → 播放器高度 16:9。
2. 點「📚 課程目錄」→ 抽屜開啟、backdrop 出現。
3. 點第一個單元 → 抽屜關閉、播放器換片。
4. 再開抽屜 → 點 ✕ → 抽屜關閉。
5. 再開抽屜 → 點遮罩 → 抽屜關閉。
6. 點留言輸入框 → 無 iOS 放大。

---

## Self-Review 對照（spec → task）

| Spec 需求 | Task |
|-----------|------|
| 新增 `isPhone`（≤640）state + resize check | Task 1 Step 1 ✓ |
| 新增 `drawerOpen` state | Task 1 Step 1 ✓ |
| `handleSelect` 在 isPhone 時 `setDrawerOpen(false)` | Task 1 Step 2 ✓ |
| `<style>` 內加 16px @media（防 iOS 放大） | Task 1 Step 3 ✓ |
| 播放器 `paddingTop` 改 `isPhone ? "56.25%" : "44%"`（3 處） | Task 2 ✓ |
| Info bar 右側手機改「📚 課程目錄 x/y」鈕 | Task 3 ✓ |
| Backdrop（`isPhone && drawerOpen` 時渲染，z-index:49） | Task 4 Step 1 ✓ |
| 右欄手機改 `position:fixed`、`transform:translateX`、z-index:50 | Task 4 Step 2 ✓ |
| 進度列右側加 ✕ 關閉鈕（`isPhone` 才顯示） | Task 4 Step 3 ✓ |
| 平板（641–1024）維持現況（堆疊、maxHeight:300） | Task 4 Step 2 非 isPhone 分支 ✓ |
| 桌機（>1024）維持現況（288px 側欄） | Task 4 Step 2 非 isPhone 分支 ✓ |
| 回歸驗收 | Task 5 ✓ |
