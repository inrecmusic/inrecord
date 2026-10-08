# 首頁課程評價跑馬燈 — 設計規格

日期：2026-10-08　狀態：已與經營者確認方向（版面稿 https://claude.ai/artifact/Am6BtMDcRcgsctJHYQ6RWM 「採用版」）

## 目標

把教室裡學員留下的真實評價（`ratings` 表）秀在官網首頁，做成 hero 正下方一條**連續循環的跑馬燈**，桌機與手機皆適用。只用真實評價，不手打推薦語；沒有文字的星星評價也能上。

同時補一個**收集評價的推力**：學員看完第 1 章後，教室儀表板出現一次「給課程評分」卡片，讓文字評價累積得起來。

## 現況（2026-10-08）

- `ratings`：5 則、4 則可見、平均 5.0；只有 1 則有文字。管理員帳號（`ADMIN_EMAIL`）自評 1 則、已隱藏。
- 首頁 hero 已顯示「平均評分 + 則數」（`lib/site-stats.js`，滿 3 則才顯示）；本功能**不重算**這組數字，直接沿用。
- 後台「課程評價」（`app/admin/CourseRatingsPage.jsx`）只能切換 `hidden` 與回覆。
- 正式站儀表板為 `HubLegacy.jsx`（`HUB_V3` 未設）；評分表單已存在於播放頁 `components/classroom/RatingTab.jsx`，打 `POST /api/classroom/rating`（已購課、每人一則）。
- `/api/classroom/bootstrap` 目前**不回**「是否已評分」。

## 範圍

### 1. 資料與後台

- `ratings` 加欄 `featured BOOLEAN NOT NULL DEFAULT false`（新 SQL 檔 `supabase-ratings-featured.sql`，idempotent；加進 CLAUDE.md 部署順序與 `docs/preview-db/build-schema.sh` 的 `ORDER`）。
- `PATCH /api/admin/ratings` 白名單多放行 `featured`（布林）。
- 後台列表每列加「首頁精選」開關，與「隱藏」並排；已隱藏的列精選開關停用（隱藏優先）。列表 badge 顯示「首頁精選」。

### 2. 首頁資料查詢（伺服端）

新增純函式 + 查詢於 `lib/featured-reviews.js`：

- `getFeaturedReviews(db, { adminEmail, limit = 12 })`：查 `ratings` where `featured = true and hidden = false`，依 `created_at desc` 取 `limit` 則，欄位 `id, score, content, user_name, user_email, created_at`；排除 `user_email` 等於 `ADMIN_EMAIL`（大小寫不敏感，與 `getSiteStats` 同口徑）。查詢失敗回 `[]`（fail-open：首頁不因此掛）。
- `toReviewCards(rows)`（純函式，有測試）：轉成前端用的卡片 `{ id, score, text, name, date }`
  - `text`：`content` 去頭尾空白；空字串 → `null`（前端顯示「給了 N 顆星」）；超過 **120 字**截斷加「…」。
  - `name`：`user_name` 去空白，空 → 「學員」。**不輸出 email。**
  - `date`：台灣時區 `YYYY/MM/DD`。
- `shouldShowMarquee(cards)`：`cards.length >= 3`。
- `fillLoop(cards, min = 8)`：不足 `min` 張就整輪重複直到 ≥ `min`（純函式，有測試；0 張回 `[]`）。

`app/page.jsx` 在現有 `getSiteStats` 的同一趟 `Promise.all` 一起查，隨頁面 `revalidate = 60` 快取；以 `reviews` prop 傳給 `HomeClient`。

### 3. 首頁區塊 `components/ReviewMarquee.jsx`

- 位置：`HomeClient.jsx` 的 `<section className={styles.hero}>` 結束後、`#intro` 之前；`id="reviews"`。
- 外觀：背景與 hero 同色（`#05070b`），與 hero 連成一片；上方標題列「課程評價」＋ `stats.rating`／`stats.ratingCount`（沿用 hero 那組，`showRating` 為 false 時只顯示標題）；下方一排卡片；底部一行「評價皆由已購課學員在教室內留下，未經改寫。」
- 卡片：星星（金色 `--gold-mid`）、文字（無文字 → 灰字「給了 N 顆星」）、暱稱、日期。桌機寬 320、手機 250；固定最小高度讓有無文字的卡等高。
- 動態：純 CSS `@keyframes` 平移整條 track 的 −50%（track = `fillLoop` 結果重複兩份，接縫無感）；速度依卡數換算，約每張 4 秒。`:hover` 與 `:active`／touch 時 `animation-play-state: paused`。
- `prefers-reduced-motion: reduce`：關閉動畫，track 改 `overflow-x: auto` 可左右滑，只放一份卡片。
- 卡片本身不是連結（避免整條跑馬燈變成誤觸區）；整段不加 CTA 按鈕，hero 已有。
- `cards.length < 3`（`shouldShowMarquee` false）→ 元件回 `null`，整段不渲染。
- 不影響 `HomeClient` 既有的 hero GSAP 捲動效果（跑馬燈在 hero 外面）。

### 4. 收集評價推力 `components/classroom/RatingNudge.jsx`

- `bootstrap` 多回 `rated: boolean`（查 `ratings` where `user_id`，head count）。只多一個輕量查詢、與現有查詢並行。
- 顯示條件（純函式 `shouldNudge({ rated, progress, chapters, videos, dismissed })`，放 `lib/rating-nudge.js`，有測試）：
  - 未評分，且
  - 第 1 章（`chapters.sort_order` 最小者）的正課單元（排除標題以「試看」開頭）**全部** `completed`，且
  - 本裝置未關閉過（localStorage `inrecord_rating_nudge_dismissed = "1"`，寫法比照 `lib/announcement-state.js`）。
- 卡片放在 `HubLegacy.jsx` 儀表板內容最上方（公告區之下、課程列表之上）；內容：「看完第 1 章了，給這堂課一個評分吧」＋ 5 顆星 ＋ 選填心得 ＋「送出」「先不用」。送出流程與 `RatingTab` 同一支 API；為了不重寫表單，把 `RatingTab` 的星星＋textarea＋送出抽成 `RatingForm`，`RatingTab` 與 `RatingNudge` 共用。
- 送出成功或按「先不用」→ 寫 localStorage 並收起；成功後 `rated` 視為 true。
- `HubV3.jsx` 同樣掛上（同一元件），確保切換新版儀表板時行為一致。

### 5. 不做

- 不新增公開 API（首頁資料走伺服端查詢）。
- 不顯示老師回覆、不做評價詳情頁、不做分頁。
- 不手動輸入外部推薦語。
- 不改 hero 的星等／則數計算。

## 測試

- `lib/featured-reviews.test.js`：`toReviewCards`（截斷 120 字、空文字 → null、無暱稱 → 學員、不含 email、日期台灣時區）、`shouldShowMarquee`（2 → false、3 → true）、`fillLoop`（4 張 → 8 張且順序循環；0 → []）。
- `lib/rating-nudge.test.js`：`shouldNudge` 四個條件各一個反例＋一個正例；試看單元不計入第 1 章完成判定。
- `components/ReviewMarquee.test.jsx`：`cards` 不足 3 張不渲染；足夠時渲染標題、每張卡的暱稱／日期、無文字卡顯示「給了 5 顆星」、不出現任何 email。
- `app/api/admin/ratings` PATCH：`featured` 可更新、其他欄位仍被白名單擋下（補到既有測試或新增）。
- 既有 `page.hero.test.jsx` 與 HomeClient 測試不受影響（`reviews` 預設 `[]`）。

## 部署

1. 正式 DB 跑 `supabase-ratings-featured.sql`（先跑 SQL 再部署程式；程式對缺欄位 fail-open，但後台開關會報錯）。
2. 部署後到後台「課程評價」勾選精選；滿 3 則首頁才會出現。
3. Preview 庫同步跑同一份 SQL。
