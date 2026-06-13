# 手機輔助頁面優化（Login 16px / content-card padding）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修兩個手機問題：① Login 輸入框 font-size 15px → 16px（防 iOS 自動縮放）；② Contact/Privacy/Terms 卡片 padding 在窄手機偏擠（加 globals.css 共用 class，手機改為 28px 20px）。

**Architecture:** Login 改 CSS Module 單行。三個內容頁統一透過 `app/globals.css` 的 `.content-card` class 控制 padding，各頁僅加 `className="content-card"` 並移除 inline padding。桌機維持 40px 44px，手機（≤640px）縮為 28px 20px。

**Tech Stack:** Next.js App Router，CSS Modules（login），全域 CSS（globals.css），Server Component inline style（contact/privacy/terms）。

**驗收說明（取代單元測試）：** 純 CSS layout 改動，無法單元測試。每個 Task 驗證 = `npm run build` 通過 + DevTools 目視指定頁面。

---

## File Structure

- **Modify:** `app/classroom/login/login.module.css:74` — `.input` font-size 15px → 16px
- **Modify:** `app/globals.css` — 尾端新增 `.content-card` + `@media` 規則（2 行）
- **Modify:** `app/contact/page.jsx:24` — 卡片 div 加 `className="content-card"`，移除 inline padding
- **Modify:** `app/privacy/page.jsx:15` — 同上
- **Modify:** `app/terms/page.jsx:15` — 同上

---

## Task 1: Login 輸入框 font-size 15px → 16px

**Files:**
- Modify: `app/classroom/login/login.module.css`（第 74 行，`.input` 規則內）

- [ ] **Step 1: 確認目標行**

```bash
grep -n "font-size: 15px" "/Users/zhoubolong/Desktop/Claude code/inrecord/app/classroom/login/login.module.css"
```

Expected: 輸出類似 `74:  font-size: 15px;`（在 `.input` 區塊內）。

- [ ] **Step 2: 修改 font-size**

找到以下程式碼（在 `.input { ... }` 規則內，約第 74 行）：

```css
  font-size: 15px;
```

替換為：

```css
  font-size: 16px;
```

完成後 `.input` 的相關部分應如下：

```css
.input {
  width: 100%;
  border: 1.5px solid var(--line, #e2e8f0);
  border-radius: 11px;
  padding: 12px 14px;
  font-size: 16px;
  font-family: inherit;
  color: var(--ink, #0f172a);
  background: #fff;
  outline: none;
  transition: border-color .18s, box-shadow .18s;
  box-sizing: border-box;
}
```

- [ ] **Step 3: build 驗證**

```bash
cd "/Users/zhoubolong/Desktop/Claude code/inrecord" && npm run build
```

Expected: 編譯成功，無錯誤。

- [ ] **Step 4: Commit**

```bash
git add app/classroom/login/login.module.css
git commit -m "fix(login): 輸入框 font-size 15px → 16px，防 iOS Safari 聚焦自動縮放

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: globals.css .content-card + 三個內容頁 className

**Files:**
- Modify: `app/globals.css`（尾端新增 2 行）
- Modify: `app/contact/page.jsx`（第 24 行）
- Modify: `app/privacy/page.jsx`（第 15 行）
- Modify: `app/terms/page.jsx`（第 15 行）

- [ ] **Step 1: 在 globals.css 尾端新增 .content-card 規則**

開啟 `app/globals.css`，找到目前最後一個區塊（`.font-numeric { ... }`），在其**之後**（檔案最末端）新增：

```css

/* ── Content-page card — responsive padding ──────────────────────────────── */
.content-card { padding: 40px 44px; }
@media (max-width: 640px) { .content-card { padding: 28px 20px; } }
```

（注意前面空一行，與上方規則分隔）

- [ ] **Step 2: 修改 contact/page.jsx 第 24 行**

找到以下現有程式碼（第 24 行）：

```jsx
        <div style={{ background: "#fff", borderRadius: 20, padding: "40px 44px", boxShadow: "0 2px 24px rgba(15,23,42,.07)" }}>
```

替換為：

```jsx
        <div className="content-card" style={{ background: "#fff", borderRadius: 20, boxShadow: "0 2px 24px rgba(15,23,42,.07)" }}>
```

（加 `className="content-card"`，移除 `padding: "40px 44px"`）

- [ ] **Step 3: 修改 privacy/page.jsx 第 15 行**

找到以下現有程式碼（第 15 行）：

```jsx
        <div style={{ background: "#fff", borderRadius: 20, padding: "40px 44px", boxShadow: "0 2px 24px rgba(15,23,42,.07)" }}>
```

替換為：

```jsx
        <div className="content-card" style={{ background: "#fff", borderRadius: 20, boxShadow: "0 2px 24px rgba(15,23,42,.07)" }}>
```

- [ ] **Step 4: 修改 terms/page.jsx 第 15 行**

找到以下現有程式碼（第 15 行）：

```jsx
        <div style={{ background: "#fff", borderRadius: 20, padding: "40px 44px", boxShadow: "0 2px 24px rgba(15,23,42,.07)" }}>
```

替換為：

```jsx
        <div className="content-card" style={{ background: "#fff", borderRadius: 20, boxShadow: "0 2px 24px rgba(15,23,42,.07)" }}>
```

- [ ] **Step 5: 確認 inline padding 已完全移除**

```bash
grep -n '"40px 44px"' \
  "/Users/zhoubolong/Desktop/Claude code/inrecord/app/contact/page.jsx" \
  "/Users/zhoubolong/Desktop/Claude code/inrecord/app/privacy/page.jsx" \
  "/Users/zhoubolong/Desktop/Claude code/inrecord/app/terms/page.jsx"
```

Expected: **無輸出**（三頁的 inline padding 已全部移除）。

- [ ] **Step 6: 確認 .content-card 已存在於 globals.css**

```bash
grep -n "content-card" "/Users/zhoubolong/Desktop/Claude code/inrecord/app/globals.css"
```

Expected: 輸出兩行（class 定義與 media query）。

- [ ] **Step 7: build 驗證**

```bash
cd "/Users/zhoubolong/Desktop/Claude code/inrecord" && npm run build
```

Expected: 編譯成功，無錯誤。

- [ ] **Step 8: Commit**

```bash
git add app/globals.css app/contact/page.jsx app/privacy/page.jsx app/terms/page.jsx
git commit -m "feat(ui): 內容頁卡片手機 padding 最佳化（content-card class, ≤640px: 28px 20px）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 全頁回歸驗收 + build

**Files:** 無（純驗證）

- [ ] **Step 1: 完整 build 測試**

```bash
cd "/Users/zhoubolong/Desktop/Claude code/inrecord" && npm run build
```

Expected: 53 頁靜態頁面全部生成，無 TS/ESLint 錯誤。

- [ ] **Step 2: Login 手機驗收（DevTools 375px）**

啟動 dev server：`npm run dev`，開 http://localhost:3000/classroom/login。

- 點擊 Email 輸入框 → 頁面**不縮放**（之前 15px 會觸發 iOS Safari 自動放大，16px 不會）
- 點擊密碼輸入框 → 同樣不縮放

- [ ] **Step 3: Contact 手機驗收（DevTools 375px）**

開 http://localhost:3000/contact，DevTools 375px：

- 卡片左右各留約 20px padding（改前 44px），閱讀區域明顯更寬
- 所有聯絡項目（Email / Instagram / 服務時間）、退款說明藍色框正常顯示

- [ ] **Step 4: Privacy / Terms 手機驗收（DevTools 375px）**

開 http://localhost:3000/privacy，DevTools 375px：
- 卡片左右 padding 縮為 20px，文字閱讀區更寬

開 http://localhost:3000/terms，同樣確認。

- [ ] **Step 5: 桌機回歸確認（DevTools 1280px）**

分別開 contact / privacy / terms，確認：
- 卡片 padding 維持 40px 44px（與改版前**無視覺差異**）
- Login 表單版面與改版前一致（font-size 16px 不影響桌機外觀）

---

## Self-Review 對照（spec → task）

| Spec 需求 | Task |
|-----------|------|
| Login `.input { font-size: 15px }` → `16px` | Task 1 ✓ |
| `globals.css` 新增 `.content-card { padding: 40px 44px }` | Task 2 Step 1 ✓ |
| `@media (max-width: 640px) { .content-card { padding: 28px 20px } }` | Task 2 Step 1 ✓ |
| `contact/page.jsx` 卡片加 `className="content-card"`，移除 inline padding | Task 2 Step 2 ✓ |
| `privacy/page.jsx` 同上 | Task 2 Step 3 ✓ |
| `terms/page.jsx` 同上 | Task 2 Step 4 ✓ |
| 桌機維持 40px 44px 不變 | Task 2 Step 1 + Task 3 Step 5 ✓ |
| `npm run build` 通過 | Task 1 Step 3 + Task 2 Step 7 + Task 3 Step 1 ✓ |
