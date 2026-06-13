# 手機／平板 UI/UX 優化 階段① 首頁 — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改動桌機版的前提下，重構首頁（`app/page.jsx`）手機與平板的佈局與資訊密度，提升手機下單體驗。

**Architecture:** 改動集中在 `app/page.module.css` 的 `@media` 區塊與手機尺寸；新增一個「底部常駐購買列」需在 `app/page.jsx` 加入少量 client 狀態與一段 JSX；Hero 需做一次桌機安全的 grid-template-areas 重構以支援手機區塊重排。

**Tech Stack:** Next.js 14 App Router、React client component、CSS Modules（原生 CSS，非 Tailwind）。CSS 變數定義於 `app/globals.css`（`--brand #2563eb`、`--gold #f7d68a`、`--line`、`--muted`、`--bg` 等）。

**驗收說明（取代單元測試）：** RWD/CSS 屬視覺行為，無法單元測試。每個 Task 的「驗證」= 啟動 dev server 後於瀏覽器 DevTools 響應式模式檢視指定寬度，確認描述結果，並比對 **桌機 ≥1280 與原版無視覺差異**。

**一次性前置：啟動 dev server**

```bash
cd "/Users/zhoubolong/Desktop/Claude code/inrecord" && npm run dev
```

開 http://localhost:3000 。DevTools 響應式模式預備檢視寬度：**375 / 390 / 414 / 768 / 1024 / 1280**。

---

## File Structure

- **Modify:** `app/page.module.css` — 所有 RWD/手機/平板/觸控樣式（主要戰場）
- **Modify:** `app/page.jsx` — Hero 區塊 grid-areas 重構（Task 2）、底部常駐購買列 JSX 與狀態（Task 3）
- 不新增檔案（常駐列以既有 CSS module class 實作，邏輯內聯於 `page.jsx`，符合既有單檔頁面慣例）

---

## Task 1: 清理已下架的死 CSS

**Files:**
- Modify: `app/page.module.css`

- [ ] **Step 1: grep 確認各 class 未被引用**

逐一確認下列 class 在 `app/page.jsx` 與 `components/` 中無引用（CSS module 以 `styles.xxx` 形式引用）：

```bash
cd "/Users/zhoubolong/Desktop/Claude code/inrecord"
for c in subSection subGiftBar subPlans subCard subCardDark subBadge subCardPeriodRow subCardIcon subHeading subCardPriceRow subCardCurrency subCardAmount subCardPer subCardMonthly subCardSavings subFeatureList subBtnOutline subBtnDark subNote planNote planBuyWrap buyBtn buyNote countdownWrap countdownDot countdownTime demoSection demoCard demoVideo demoPlay demoSide demoTimer demoConversion planSpotsRow planSpots planDiscountTag planSavingsTag planOriginal planPriceOriginalRow planCardDark planCardSelected featuresSection; do
  n=$(grep -rn "styles\.$c\b\|styles\[.$c.\]" app components 2>/dev/null | wc -l | tr -d ' ');
  echo "$c -> $n refs";
done
```

Expected: 每一項皆為 `0 refs`。**若有任何項 > 0，將該 class 從刪除清單剔除、保留之**，並在本步驟註記。

- [ ] **Step 2: 刪除確認為 0 引用的死 class 規則**

在 `app/page.module.css` 移除上述確認為 0 引用之 class 的所有規則，包含其專屬 `@keyframes dotPulse`（倒數用）。保留仍被使用的：`planUnit`、`planFeatures`、`planBtn`、`planPillDark`、`planRibbon`、`planPill`、`planPriceBlock`、`planPriceRow`、`planCurrency`、`planPrice`、`planName`、`planDesc`、`planCardFeatured`、`planBtnFeatured`、`planHeaderRow`、`planPillDot` 等首頁實際使用者。

- [ ] **Step 3: 驗證 build 不破、頁面正常**

Run: `npm run build`
Expected: 編譯成功、無 CSS 解析錯誤。瀏覽器重整首頁，桌機與手機外觀與刪除前一致（被刪的都是無引用樣式）。

- [ ] **Step 4: Commit**

```bash
git add app/page.module.css
git commit -m "refactor(home): 移除已下架訂閱制/倒數/demo 死 CSS

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Hero 手機重排（grid-areas 重構 + 影片上移 + 尺寸）

桌機 Hero 目前為 `1fr 360px` 兩欄，左欄含 eyebrow/h1/lead/ctas/features，右欄為 videoCard。需讓「手機先看到影片」（影片卡在文案之後、特色格之前），同時**桌機完全不變**。做法：把 heroFeatures 拆成 grid 第三個子元素，桌機用 `grid-template-areas` 還原原版佈局，手機用 `order` 重排。

**Files:**
- Modify: `app/page.jsx`（Hero 區塊，約 317–360 行）
- Modify: `app/page.module.css`（`.heroGrid`、新增 areas、手機 order/尺寸）

- [ ] **Step 1: 重構 Hero JSX，把 heroFeatures 拆為 grid 第三子元素**

將 `app/page.jsx` 的 Hero `heroGrid` 內容改為三個直接子元素：intro 區（含 eyebrow/h1/lead/ctas）、features 區、aside 影片卡。把原本包在同一個 `motion.div` 裡的 `heroFeatures` 移出成獨立 `motion.div`：

```jsx
<section className={styles.hero}>
  <div className={styles.container + " " + styles.heroGrid}>
    <motion.div className={styles.heroIntro} variants={stagger} initial="hidden" animate="visible">
      <motion.div variants={fadeUp} className={styles.eyebrow}>流行鋼琴零基礎入門課</motion.div>
      <motion.h1 variants={fadeUp}>從零開始彈出<br/>你喜歡的<span>流行歌曲</span></motion.h1>
      <motion.p variants={fadeUp} className={styles.heroLead}>10 章節系統化學習，搭配 AI 互動遊戲練習，讓學鋼琴變得有趣、有效、看得見進步。</motion.p>
      <motion.div variants={fadeUp} className={styles.heroCtas}>
        <button className={`${styles.btnRed} ${styles.btnPulse} ${styles.heroBuyBtn}`} onClick={openBuy}>立即購買課程</button>
        <button className={styles.btnOutline} onClick={() => setPreviewOpen(true)}>
          <Play size={16} />觀看試看影片
        </button>
      </motion.div>
    </motion.div>

    <motion.aside
      className={styles.videoCard}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.7, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className={styles.videoThumb} onClick={() => setPreviewOpen(true)} role="button" tabIndex={0}>
        <div className={styles.play}><Play size={22} fill="currentColor" /></div>
      </div>
      <h3>課程介紹影片</h3>
      <ul className={styles.checkList}>
        {["10 章節完整課程","20+ 首流行歌曲實戰","AI 互動遊戲強化學習","樂譜下載","無限次觀看，隨時學習","專屬學員社群，老師答疑"].map(i => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </motion.aside>

    <motion.div className={styles.heroFeatures} variants={fadeUp} initial="hidden" animate="visible">
      {[
        [Music2,        "零基礎可學",   "從認識鍵盤開始"],
        [Bot,           "AI 互動遊戲",  "學習不再枯燥"],
        [Music,         "流行曲目實戰", "學完就能彈歌"],
        [GraduationCap, "打好扎實基礎", "銜接進階更輕鬆"],
      ].map(([Icon, title, sub]) => (
        <div key={title} className={styles.heroFeature}>
          <div className={styles.heroIcon}><Icon size={28} strokeWidth={1.5} /></div>
          <strong>{title}</strong>
          <span>{sub}</span>
        </div>
      ))}
    </motion.div>
  </div>
</section>
```

注意：DOM 順序改為 intro → aside → features。桌機靠 grid-areas 還原視覺，手機靠 order 重排。

- [ ] **Step 2: 桌機用 grid-areas 還原原版兩欄佈局**

在 `app/page.module.css` 將 `.heroGrid` 改為：

```css
.heroGrid {
  display: grid;
  grid-template-columns: 1fr 360px;
  grid-template-areas:
    "intro video"
    "features video";
  gap: 0 48px;
  align-items: start;
}
.heroIntro    { grid-area: intro; }
.heroFeatures { grid-area: features; grid-template-columns: repeat(4,1fr); display: grid; gap: 16px; max-width: 680px; margin-top: 34px; }
.videoCard    { grid-area: video; align-self: center; }
```

（原 `.heroFeatures` 既有的 `display/grid-template-columns/gap/max-width` 規則改由上方統一定義；移除舊的重複宣告避免衝突。原 `.heroCtas { margin-bottom: 42px }` 改為 0 或保留作 intro 與 features 間距——以 features 的 `margin-top: 34px` 控制間距，將 `.heroCtas` 的 `margin-bottom` 設為 0。）

- [ ] **Step 3: 驗證桌機 Hero 無視覺回歸**

DevTools 寬度 1280：Hero 左欄（標題/文案/兩顆 CTA/4 格特色）與右側影片卡的相對位置、間距與原版一致。

- [ ] **Step 4: 手機重排 — 影片上移、特色 2×2、字級收斂**

在 `app/page.module.css` 既有 `@media (max-width: 980px)` 區塊調整 Hero，並在 640 區塊調整字級。把 `.heroGrid` 在 ≤980 改單欄並用 order 排「intro → video → features」：

```css
@media (max-width: 980px) {
  .heroGrid {
    grid-template-columns: 1fr;
    grid-template-areas: none;
    gap: 0;
  }
  .heroIntro    { order: 1; }
  .videoCard    { order: 2; margin: 22px 0 4px; align-self: stretch; }
  .heroFeatures { order: 3; grid-template-columns: repeat(2,1fr); max-width: none; margin-top: 22px; }
}
```

在 640 區塊把 Hero 字級/間距收斂（Hero 標題改更安全的 clamp 下限、lead 縮小，特色維持 2×2）：

```css
@media (max-width: 640px) {
  .hero { padding: 48px 0 72px; }
  .hero h1 { font-size: clamp(30px, 7vw, 44px); margin-bottom: 16px; }
  .heroLead { font-size: 16px; line-height: 1.6; margin-bottom: 22px; }
  .videoThumb { height: 180px; }
}
```

（移除舊 `@media (max-width:640px)` 內把 `.heroFeatures` 設為 `grid-template-columns: 1fr` 的規則——改維持 2×2。`.statsCard`、`.featureGrid` 的 1 欄設定見 Task 4。）

- [ ] **Step 5: 驗證手機 Hero**

DevTools 寬度 375 / 414：順序為 eyebrow→標題→文案→兩顆 CTA→**影片卡**→特色 2×2；標題不破版/不溢出；無水平捲動。寬度 768：同為單欄重排、影片在文案後。

- [ ] **Step 6: Commit**

```bash
git add app/page.jsx app/page.module.css
git commit -m "feat(home): Hero 手機重排（影片上移、特色2×2、字級收斂），桌機 grid-areas 不變

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 底部常駐購買列（Sticky Buy Bar）

手機專用，捲過 Hero 後 `fixed` 於底部，顯示「NT$3,999／學琴全攻略 + 立即購買」，點擊呼叫既有 `startBuy(PLANS[1])`。桌機不顯示。用 IntersectionObserver 觀察 Hero 是否離開視窗來切換顯示。

**Files:**
- Modify: `app/page.jsx`（新增狀態 + ref + JSX）
- Modify: `app/page.module.css`（新增 `.stickyBuyBar` 等樣式 + footer 底部留白）

- [ ] **Step 1: 在 HomePage 加入顯示狀態與 Hero 觀察**

在 `app/page.jsx` 的 `HomePage` 內新增 state 與 ref，並用 IntersectionObserver 觀察 hero section（捲出視窗→顯示常駐列）。先給 `<section className={styles.hero}>` 加上 `ref={heroRef}`：

```jsx
const [showStickyBar, setShowStickyBar] = useState(false);
const heroRef = useRef(null);

useEffect(() => {
  const el = heroRef.current;
  if (!el) return;
  const obs = new IntersectionObserver(
    ([entry]) => setShowStickyBar(!entry.isIntersecting),
    { rootMargin: "0px 0px -100% 0px" } // hero 底部離開視窗頂端後才顯示
  );
  obs.observe(el);
  return () => obs.disconnect();
}, []);
```

把 Hero 區塊改為 `<section ref={heroRef} className={styles.hero}>`。

- [ ] **Step 2: 在 `</main>` 之後、`<footer>` 之前加入常駐列 JSX**

```jsx
<div className={`${styles.stickyBuyBar} ${showStickyBar ? styles.stickyBuyBarShow : ""}`}>
  <div className={styles.stickyBuyInfo}>
    <span className={styles.stickyBuyPrice}>NT$3,999</span>
    <span className={styles.stickyBuyLabel}>學琴全攻略</span>
  </div>
  <button className={styles.stickyBuyBtn} onClick={() => startBuy(PLANS[1])}>
    <ShoppingCart size={17} />立即購買
  </button>
</div>
```

（`ShoppingCart` 已在檔案頂部 import；`startBuy`、`PLANS` 已存在。）

- [ ] **Step 3: 新增常駐列樣式（手機顯示、桌機隱藏）**

在 `app/page.module.css` 末端新增：

```css
.stickyBuyBar {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  z-index: 60;
  display: none;            /* 預設隱藏；≤768 才啟用 */
  align-items: center;
  gap: 12px;
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
  background: rgba(15,23,42,.97);
  backdrop-filter: blur(12px);
  border-top: 1px solid rgba(255,255,255,.1);
  transform: translateY(110%);
  transition: transform .3s ease;
}
.stickyBuyBarShow { transform: translateY(0); }
.stickyBuyInfo { display: flex; flex-direction: column; line-height: 1.2; }
.stickyBuyPrice { color: #fff; font-size: 18px; font-weight: 800; letter-spacing: -.02em; }
.stickyBuyLabel { color: rgba(255,255,255,.6); font-size: 12px; }
.stickyBuyBtn {
  margin-left: auto;
  display: inline-flex; align-items: center; gap: 7px;
  border: 0; border-radius: 10px; cursor: pointer;
  padding: 12px 20px; font-size: 15px; font-weight: 700; color: #fff;
  background: linear-gradient(135deg, #1d4ed8, #3b82f6);
  box-shadow: 0 6px 20px rgba(37,99,235,.4);
}
@media (max-width: 768px) {
  .stickyBuyBar { display: flex; }
  .footer { padding-bottom: calc(40px + 64px + env(safe-area-inset-bottom)); } /* 預留空間不被常駐列遮擋 */
}
```

- [ ] **Step 4: 驗證常駐列行為**

DevTools 寬度 375：頁面在 Hero 頂部時常駐列**隱藏**；向下捲動超過 Hero 後從底部滑入、顯示「NT$3,999 / 學琴全攻略 / 立即購買」；捲回頂部時滑出隱藏。點「立即購買」→ 已登入開啟 BuyModal、未登入導向 `/classroom/login`（與既有 `startBuy` 一致）。捲到頁尾時常駐列不遮擋頁尾連結。寬度 1280：常駐列完全不顯示。

- [ ] **Step 5: Commit**

```bash
git add app/page.jsx app/page.module.css
git commit -m "feat(home): 手機底部常駐購買列（捲過 Hero 顯示，主打 NT\$3,999）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Stats 數據條手機優化

移除手機上 `translateY(-52px)` 造成的重疊；手機改 2×2。

**Files:**
- Modify: `app/page.module.css`

- [ ] **Step 1: 調整 Stats 手機樣式**

在既有 `@media (max-width: 980px)` 加入（或調整）：

```css
@media (max-width: 980px) {
  .statsCard { grid-template-columns: repeat(2,1fr); }
}
@media (max-width: 640px) {
  .stats { transform: translateY(-28px); }      /* 減少上移量，避免手機重疊感 */
  .statsCard { grid-template-columns: repeat(2,1fr); padding: 20px 14px; }
  .stat { border-right: 1px solid var(--line); border-bottom: 0; padding: 14px 8px; }
  .stat:nth-child(2n) { border-right: 0; }
  .stat:nth-child(-n+2) { border-bottom: 1px solid var(--line); }
}
```

（移除舊 640 區塊中把 `.statsCard` 設 `1fr`、`.stat` 上下邊框的規則，改為上面的 2×2 格線。）

- [ ] **Step 2: 驗證**

DevTools 375 / 414：數據為 2×2、四格分隔線正確、與上方 Hero 無重疊或過大空白。768：2×2 或 4 欄皆可接受、不破版。1280：維持原 4 欄一排、上移 -52px 不變。

- [ ] **Step 3: Commit**

```bash
git add app/page.module.css
git commit -m "fix(home): Stats 手機改 2×2、收斂上移量避免重疊

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Points 五大學習重點 — 手機改 1 欄清單列

POINT 2–5 的 4 卡（`.pointCard`：圖示在上、文字置中）手機改為 1 欄清單列（圖示在左、文字在右）。POINT 1 為互動輪播 `PointCarousel`，本任務只確認其手機不破版。

**Files:**
- Modify: `app/page.module.css`

- [ ] **Step 1: 手機把 pointGrid 改單欄、pointCard 改 flex-row**

在 `app/page.module.css` 新增：

```css
@media (max-width: 640px) {
  .pointGrid { grid-template-columns: 1fr; gap: 10px; }
  .pointCard {
    flex-direction: row;
    align-items: center;
    text-align: left;
    gap: 14px;
    padding: 14px 16px;
  }
  .pointCardIcon { width: 44px; height: 44px; border-radius: 12px; margin-bottom: 0; }
  .pointCard strong { font-size: 15px; }
  .pointCard span { font-size: 12.5px; }
  .pointBlock { padding: 40px 0; }
  .pointTitle { margin-bottom: 24px; }
}
```

（`.pointCard` 是 flex column；上面在手機覆寫為 row。`.pointCard span` 需與 strong 同欄左對齊——因 pointCard 改 row 後 strong/span 為其直接子，需用 wrapper 或讓 strong/span 並排於右側。實作：保留現有 DOM，於手機讓 `.pointCard` 為 row、圖示為第一子、再用 `.pointCard strong, .pointCard span { text-align: left; width: 100%; }` 並把 strong+span 包不便——改用下方 Step 1b 的純 CSS 對齊。）

- [ ] **Step 1b: 純 CSS 對齊（不改 DOM）**

`.pointCard` 三個直接子為 `pointCardIcon`、`strong`、`span`。手機 row 佈局下，讓圖示固定、strong 與 span 換行堆右側：

```css
@media (max-width: 640px) {
  .pointCard { flex-wrap: wrap; }
  .pointCardIcon { flex: 0 0 auto; }
  .pointCard strong { flex: 1 1 calc(100% - 58px); text-align: left; }
  .pointCard span   { flex: 1 1 100%; margin-left: 58px; text-align: left; } /* 58px = 圖示44 + gap14 */
}
```

- [ ] **Step 2: 驗證 Points 手機**

DevTools 375：POINT 2–5 每段 4 列、圖示在左、標題與說明在右且左對齊、無破版。POINT 1 互動鍵盤輪播（已有自身 RWD：660px 高、箭頭隱藏、420px→600px）正常、鍵盤不溢出、圓點可點。768：可維持 2 欄格（不套用 640 規則即原樣）。1280：維持 4 欄格不變。

- [ ] **Step 3: Commit**

```bash
git add app/page.module.css
git commit -m "feat(home): Points 手機改 1 欄清單列（圖左字右）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Pricing 課程方案手機優化

兩卡手機直堆、主打方案（bundle, NT$3,999）置頂、按鈕加大。

**Files:**
- Modify: `app/page.module.css`

- [ ] **Step 1: 手機讓 featured 卡置頂、按鈕加大、角標收斂**

`PLANS` 陣列順序為 `[course, bundle]`，畫面預設 course 在前。手機要讓 featured（bundle）在前，用 `order`：

```css
@media (max-width: 980px) {
  .plansRow { grid-template-columns: 1fr; max-width: 420px; }
  .planCardFeatured { order: -1; }   /* 主打置頂 */
}
@media (max-width: 640px) {
  .planCard { padding: 22px 18px 20px; }
  .planBtn { padding: 15px 16px; font-size: 16px; }   /* 點擊區加大 */
  .planPrice { font-size: 40px; }
  .planRibbon { top: 18px; right: -34px; padding: 5px 40px; font-size: 10px; } /* 確認窄卡不溢出 */
}
```

- [ ] **Step 2: 驗證 Pricing 手機**

DevTools 375 / 414：兩卡直向堆疊、**「學琴全攻略 NT$3,999」在上**、「最推薦」角標不溢出卡片、按鈕夠大好點（≥44px 高）。1280：維持兩卡並排、featured 置中 scale、order 不影響（`@media min-width:861px` 的 scale 仍在）。

- [ ] **Step 3: Commit**

```bash
git add app/page.module.css
git commit -m "feat(home): Pricing 手機主打方案置頂、按鈕加大

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Intro / Curriculum / Instructor / FAQ / CTA 間距與小手機收斂

這些區塊已有 980 斷點處理雙欄轉單欄，本任務補手機/小手機間距收斂，避免沿用桌機留白。

**Files:**
- Modify: `app/page.module.css`

- [ ] **Step 1: 收斂 section 內距與字級（640 / 400）**

新增：

```css
@media (max-width: 640px) {
  .introSection, .pricingSection, .instructorSection, .faqSection, .ctaSection, .curriculum { padding: 48px 0; }
  .pointsSection { padding: 12px 0 48px; }
  .sectionHead { margin-bottom: 28px; }
  .sectionHead p { font-size: 16px; }
  .featureGrid { grid-template-columns: 1fr; gap: 12px; }
  .featureCard { padding: 22px 20px; }
  .introGrid { gap: 32px; }
  .pianoPhoto { min-height: 220px; }
  .instructorPhoto { min-height: 280px; }
  .instructorGrid { gap: 28px; }
  .moduleSummary { grid-template-columns: 44px 1fr 28px; gap: 12px; padding: 18px 16px; }
  .moduleSummary h3 { font-size: 16px; }
  .num { width: 32px; height: 32px; font-size: 13px; }
  .moduleBody { padding: 0 16px 20px; }
  .faqSummary { font-size: 15px; padding: 18px 16px; }
  .faqContent p { padding: 0 16px 18px; }
  .cta { padding: 40px 22px; border-radius: 22px; }
}
@media (max-width: 400px) {
  .container { width: calc(100% - 32px); }
  .hero h1 { font-size: clamp(27px, 7.5vw, 34px); }
  .heroFeature { padding: 12px 8px; }
  .sectionHead h2 { font-size: clamp(24px, 7vw, 30px); }
}
```

（移除舊 640 區塊中與此重複的 `.featureGrid { 1fr }`、`.cta { padding }`，統一在此。）

- [ ] **Step 2: 驗證**

DevTools 375 / 390 / 414：各區塊上下留白明顯收斂、不再像桌機那樣空曠；課程大綱手風琴展開圖文正常；講師照片不佔滿整屏。寬度 360（小手機）：容器左右邊距收斂、Hero 標題與區塊標題不破版、無水平捲動。1280：上述 section 內距維持原 70–80px 不變（規則都在 ≤640）。

- [ ] **Step 3: Commit**

```bash
git add app/page.module.css
git commit -m "polish(home): 手機/小手機區塊間距與字級收斂

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: 平板專屬佈局（768–1024）

目前 980 以下直接全部單欄，平板（尤其 iPad 直式 768、橫式 1024）顯得空。補中間佈局：多欄卡片維持較高密度。

**Files:**
- Modify: `app/page.module.css`

- [ ] **Step 1: 新增平板斷點**

```css
@media (min-width: 768px) and (max-width: 1024px) {
  .container { width: calc(100% - 56px); }
  .heroFeatures { grid-template-columns: repeat(4,1fr); } /* 平板特色維持 4 欄 */
  .featureGrid { grid-template-columns: repeat(2,1fr); }
  .pointGrid { grid-template-columns: repeat(2,1fr); }    /* 平板維持 2 欄格、不套用手機 1 欄清單 */
  .plansRow { grid-template-columns: repeat(2, minmax(0,340px)); } /* 平板兩卡並排 */
}
```

注意順序：此 `min-width:768px` 區塊須置於 `max-width:640/980` 規則之後，確保平板覆寫優先（CSS 後者勝出 + 媒體查詢不重疊於 ≤640）。769–1024 不會套用 ≤640 規則，但會套用 ≤980 規則 → 上面明確覆寫回多欄。

- [ ] **Step 2: 驗證平板**

DevTools 768（iPad 直）：Hero 特色 4 欄、Intro 特色 2 欄、Points 2 欄格、方案兩卡並排、各區塊不過於空曠。1024（iPad 橫）：同上、版面飽滿接近桌機。375：不受影響（仍為手機單欄/清單）。1280：不受影響。

- [ ] **Step 3: Commit**

```bash
git add app/page.module.css
git commit -m "feat(home): 新增平板（768–1024）專屬多欄佈局

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: 觸控優化（停用 hover 位移、點擊區）

觸控裝置上 hover 位移會造成「點一下卡片跳動後才反應」的怪感；停用之。

**Files:**
- Modify: `app/page.module.css`

- [ ] **Step 1: 觸控裝置停用 hover 位移**

```css
@media (hover: none) {
  .planCard:hover,
  .pointCard:hover,
  .module:hover,
  .featureCard:hover { transform: none; box-shadow: none; }
  .btnRed:hover:not(:disabled) { transform: none; }
  .planBtn:hover { transform: none; background: #fff; }
  .planBtnFeatured:hover { background: linear-gradient(135deg, #1d4ed8, #3b82f6); }
}
```

- [ ] **Step 2: 驗證**

DevTools 切換為觸控模擬（responsive + touch）：卡片不再有 hover 浮起；按鈕點擊正常。桌機滑鼠（hover: hover）行為不變——1280 滑過卡片仍有浮起效果。

- [ ] **Step 3: Commit**

```bash
git add app/page.module.css
git commit -m "polish(home): 觸控裝置停用 hover 位移

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: 全寬度回歸驗收

**Files:** 無（純驗證）

- [ ] **Step 1: 桌機回歸**

DevTools 1280 與 1440：逐區塊（Nav→Hero→Stats→Intro→Points→Curriculum→Instructor→Pricing→FAQ→CTA→Footer）對照本次改動前的桌機外觀，確認**無視覺差異**。常駐購買列不顯示。

- [ ] **Step 2: 手機/平板總驗收**

依序檢視 360 / 375 / 390 / 414 / 768 / 1024：無水平捲動溢出、無破版、文字不截斷、點擊區足夠、影片在 Hero 文案後、Points 為清單列、Pricing 主打置頂、常駐列出現/隱藏與不遮擋正確。

- [ ] **Step 3: build 驗證**

Run: `npm run build`
Expected: 編譯成功、無錯誤/警告新增。

- [ ] **Step 4: 收尾 commit（如有微調）**

```bash
git add -A
git commit -m "test(home): 全斷點回歸驗收與微調

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review 對照（spec → task）

- Hero 精簡/影片上移/特色 2×2/字級 → Task 2 ✓
- 底部常駐購買列（NT$3,999 學琴全攻略）→ Task 3 ✓
- Stats 取消 translateY 重疊 + 2×2 → Task 4 ✓
- Points 1 欄清單列 + POINT1 不破版 → Task 5 ✓
- Pricing 主打置頂 + 按鈕加大 → Task 6 ✓
- Intro/Curriculum/Instructor/FAQ/CTA 間距收斂 + 小手機(≤400) → Task 7 ✓
- 平板(768–1024)專屬佈局 → Task 8 ✓
- 觸控優化(@media hover:none, ≥44px) → Task 9 ✓
- 死 CSS 清理 → Task 1 ✓
- 桌機不變 → 每任務驗證 + Task 10 回歸 ✓
```
