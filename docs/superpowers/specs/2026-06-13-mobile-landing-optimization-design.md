# 手機／平板 UI/UX 優化 — 階段① 首頁銷售頁

**日期**：2026-06-13
**範圍**：`app/page.jsx` + `app/page.module.css`（首頁銷售頁）
**方向**：Mobile-first 重構（維持現有藍金視覺風格，重排手機資訊密度與佈局，新增平板專屬佈局與觸控優化）

---

## 背景與目標

用戶下單大多透過手機，但首頁 RWD 目前只有 3 個斷點（980 / 768 / 640），缺平板中間佈局與小手機微調，多處桌機尺寸寫死，導致手機顯示與桌機視覺有明顯落差。

**目標**：讓手機（含小手機）與平板的瀏覽與下單體驗，與桌機版質感一致；提升手機轉換率。**桌機版維持不變**——所有改動集中在 `@media` 區塊與手機尺寸，不動桌機既有呈現。

本階段只做首頁。後續階段（②BuyModal ③classroom ④登入/成功等次要頁）各自獨立設計與實作。

## 整體做法

- **斷點策略**：保留現有 `980 / 768 / 640`，**新增**：
  - `1024px`（平板橫式上限）— 平板專屬佈局
  - `~400px`（小手機）— 字級/間距再收斂
- **觸控優化**：`@media (hover: none)` 停用卡片 hover 位移與 `btnPulse` 以外的 hover 效果；互動點擊區 ≥ 44px。
- **死 CSS 清理**：移除首頁已不再使用的訂閱制/倒數/demo 區塊樣式（`subSection`、`subCard*`、`subPlans`、`subGiftBar`、`subBtn*`、`subFeature*`、`subBadge`、`subHeading`、`countdownWrap`、`countdownDot`、`countdownTime`、`dotPulse`、`demoSection`、`demoCard`、`demoVideo`、`demoPlay`、`demoSide`、`demoTimer`、`demoConversion`、`planSpots*`、`planNote`、`buyBtn`、`buyNote`、`planDiscountTag*`、`planSavingsTag*`、`planOriginal`、`planCardDark`、`planCardSelected` 等）。**清理前先 `grep` 確認該 class 未被 `page.jsx` 或其他元件引用**，逐一移除，避免誤刪。

## 區塊改動明細

### 1. Nav 導覽列
- 手機維持 Logo + 漢堡選單。原 `btnRed.navBtn`（手機已隱藏）保持隱藏，購買動線改由新的「底部常駐購買列」承擔。
- 確認 `mobileMenu` 點擊區與字級在小手機正常。

### 2. Hero（精簡）
- **標題字級**：`clamp()` 下限改小（如 `clamp(30px, 7vw, 72px)`），避免窄螢幕卡在 44px 破版/撐行。維持 `text-wrap: balance`、中文不斷詞規則（`word-break: keep-all`）。
- **文案**：`heroLead` 手機字級下調（如 16px）、行高收斂。
- **試看影片卡上移**：手機版（≤640 或 ≤768）將 `videoCard`（aside）以 CSS `order` 移到文案/標題之後、特色格之前——手機先看到影片。桌機維持右側欄。
- **特色格 `heroFeatures`**：手機維持/改 **2×2**（目前 640 以下是 1 欄，改為 2 欄更精簡）。
- **CTA**：手機可隱藏 Hero 內兩顆 CTA（交給常駐列），或保留主 CTA、移除次要——實作時以保留「觀看試看影片」次要鈕、主購買交給常駐列為準（避免重複）。

### 3. 底部常駐購買列（Sticky Buy Bar）— 新元件
- **行為**：手機（≤768）專用。捲動超過 Hero 後 `fixed` 於底部出現；捲回 Hero 時隱藏。桌機不顯示。
- **內容**：左「NT$3,999／學琴全攻略」+ 右「立即購買 ▸」按鈕。點擊呼叫既有 `startBuy(PLANS[1])`（未登入會導向登入，與現有邏輯一致）。
- **實作**：在 `page.jsx` 加一個 client 元件 / 區塊，用 scroll 監聽（或 IntersectionObserver 觀察 Hero）切換顯示；樣式在 `page.module.css`。需處理 `safe-area-inset-bottom`（iPhone 底部安全區）。
- **不遮擋**：頁面底部留出對應 padding，避免常駐列蓋住 footer/CTA。

### 4. Stats 數據條
- 移除 `transform: translateY(-52px)` 在手機造成的重疊/留白（手機改為正常流，或縮小位移量）。
- 手機改 **2×2**（目前 640 以下為 1 欄，過長）；分隔線改為格線適配 2×2。

### 5. Intro 課程設計說明
- 4 張 `featureCard` 手機 1 欄、間距收斂。
- `introGrid` 維持單欄堆疊；`pianoPhoto` 高度收斂。

### 6. Points ×5 五大學習重點 — 改 1 欄清單列
- POINT 2–5（4 卡格）手機改 **1 欄清單列**：圖示在左、標題＋說明在右（`pointCard` 在手機改為 flex-row 排版）。內容全可見、好讀、比 2 欄方格短。
- 平板（768–1024）可維持 2 欄格。
- **POINT 1** 為互動鍵盤輪播 `PointCarousel`（`components/PointCarousel`）——本階段確保其手機不破版（鍵盤寬度、輪播控制點擊區），不改其互動形式。

### 7. Curriculum 課程大綱手風琴
- `moduleSummary` grid（54px / 1fr / 38px）在小手機收斂；`moduleBody` 展開內容圖文上下排（已有 980 斷點，補小手機間距）。
- 點擊區與 chevron 對齊確認。

### 8. Instructor 講師介紹
- 照片在上、文案在下（已有 980 斷點）；`instructorPhoto` 手機高度收斂避免佔滿整屏。

### 9. Pricing 課程方案
- 兩卡手機直向堆疊（已有 980 斷點）。**主打方案（bundle, NT$3,999）排最上**並維持 featured 強調；`planBtn` 手機加大、點擊區 ≥ 44px。
- `planRibbon`（45° 角標）在窄卡片確認不溢出/破版。

### 10. FAQ / CTA / Footer
- FAQ 手風琴字級/間距小手機收斂。
- `cta` 內距手機收斂（已有 640 斷點，微調）。
- Footer 維持，確認常駐購買列不遮擋。

## 驗收方式

- `npm run dev` 後，於瀏覽器 DevTools 裝置模擬下檢視關鍵寬度：**375（iPhone）、390、414、768（iPad 直）、1024（iPad 橫）**，以及實機（若可）。
- 逐區塊比對：無破版、無水平捲動溢出、文字不被截斷、點擊區足夠、常駐列出現/隱藏正確且不遮擋內容。
- 桌機（≥1280）與原版逐區塊比對**無視覺差異**（確保改動只影響手機/平板）。

## 不在本階段範圍

- BuyModal、classroom、login/success/contact 等頁面（後續階段）。
- 配色/字體/品牌視覺翻新（屬 C 方案，未採用）。
- 桌機版佈局調整。

## 風險與緩解

- **死 CSS 誤刪**：清理前逐一 `grep` class 名確認未被引用。
- **常駐購買列遮擋/重複動線**：底部留 padding；Hero 內主 CTA 與常駐列擇一，避免重複。
- **桌機回歸**：改動集中在 `@media`，完成後比對桌機無差異。
