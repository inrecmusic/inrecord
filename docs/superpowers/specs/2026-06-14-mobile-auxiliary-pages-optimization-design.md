# 手機／平板 UI/UX 優化 — 階段④ 輔助頁面（Login / Contact / Privacy / Terms）

**日期**：2026-06-14
**範圍**：`app/classroom/login/login.module.css`、`app/globals.css`、`app/contact/page.jsx`、`app/privacy/page.jsx`、`app/terms/page.jsx`
**方向**：修兩個具體手機問題：① Login 輸入框 font-size 防 iOS 縮放、② 內容頁卡片 padding 在窄手機偏擠。不動視覺設計、不動邏輯。

---

## 背景與目標

階段①②③已完成首頁、BuyModal、教室的手機優化。剩餘輔助頁面僅有兩個真正影響手機體驗的問題：

1. **Login 輸入框自動縮放**：`login.module.css` 的 `.input { font-size: 15px }` 比 iOS Safari 防縮放門檻（16px）少 1px，使用者聚焦 Email 或密碼欄時頁面自動放大，體驗破碎。
2. **內容卡片 padding 在窄手機偏擠**：Contact / Privacy / Terms 三頁的卡片皆為 `padding: "40px 44px"`（inline style）。375px 手機：卡片寬 335px，扣掉兩側 88px padding 僅剩 **247px** 內容寬；360px 以下更緊。改為手機版 `28px 20px` 後內容寬達 295px，改善明顯。

**不在範圍：**
- `app/success/page.jsx`：`padding: 24` + `flexWrap: wrap` 已足夠，無問題。
- `app/auth/callback/page.jsx`：純 spinner，無 UX 可優化。
- 任何視覺設計、配色、字型、邏輯變更。

---

## 設計

### 做法 A：globals.css 共用 class（選定）

在現有 `app/globals.css` 尾端新增 `.content-card` 規則，三個內容頁各加一個 `className="content-card"` 並移除 inline padding。Login CSS module 單獨修 font-size。

**優點：** 不新增任何檔案、單一定義驅動 3 頁、改動最小。

---

## 具體改動

### 1. `app/classroom/login/login.module.css`（第 74 行）

```css
/* 改前 */
font-size: 15px;
/* 改後 */
font-size: 16px;
```

位置：`.input` 規則內。防止 iOS Safari 在使用者聚焦 Email / 密碼 / OTP 驗證碼輸入框時自動縮放頁面。

### 2. `app/globals.css`（尾端新增 2 行）

```css
.content-card { padding: 40px 44px; }
@media (max-width: 640px) { .content-card { padding: 28px 20px; } }
```

桌機維持 40px 44px 不變；手機（≤640px）左右 padding 縮為 20px，上下縮為 28px。

### 3. `app/contact/page.jsx`（第 24 行）

```jsx
/* 改前 */
<div style={{ background: "#fff", borderRadius: 20, padding: "40px 44px", boxShadow: "0 2px 24px rgba(15,23,42,.07)" }}>

/* 改後 */
<div className="content-card" style={{ background: "#fff", borderRadius: 20, boxShadow: "0 2px 24px rgba(15,23,42,.07)" }}>
```

### 4. `app/privacy/page.jsx`（第 15 行）

```jsx
/* 改前 */
<div style={{ background: "#fff", borderRadius: 20, padding: "40px 44px", boxShadow: "0 2px 24px rgba(15,23,42,.07)" }}>

/* 改後 */
<div className="content-card" style={{ background: "#fff", borderRadius: 20, boxShadow: "0 2px 24px rgba(15,23,42,.07)" }}>
```

### 5. `app/terms/page.jsx`（第 15 行）

```jsx
/* 改前 */
<div style={{ background: "#fff", borderRadius: 20, padding: "40px 44px", boxShadow: "0 2px 24px rgba(15,23,42,.07)" }}>

/* 改後 */
<div className="content-card" style={{ background: "#fff", borderRadius: 20, boxShadow: "0 2px 24px rgba(15,23,42,.07)" }}>
```

---

## 驗收方式

`npm run dev` 後：

- **Login（375px）**：聚焦 Email 或密碼輸入框 → 頁面**不自動縮放**。
- **Contact / Privacy / Terms（375px）**：內容卡片左右各留 20px padding，閱讀區寬約 295px（改善前 247px）。
- **Contact / Privacy / Terms（1280px）**：卡片 padding 維持 40px 44px，與改版前**無視覺差異**。
- `npm run build` 編譯成功、無錯誤。

## 風險與緩解

- **CSS class 名稱衝突**：`.content-card` 為通用名稱，已確認 globals.css 及全站其他 CSS 檔案均未使用此名稱。
- **inline style 優先級**：padding 已從 inline 移除，class 規則不會被 inline 覆蓋。
- **桌機回歸**：`.content-card` 桌機值 `40px 44px` 與原 inline style 相同，無視覺差異。
