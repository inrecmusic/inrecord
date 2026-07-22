# Hero 視差入場 — 設計 spec

- 日期:2026-07-22
- 狀態:已核准,待實作
- 範圍:InRecord 首頁 Hero(`app/HomeClient.jsx`)

## 目標

首頁 Hero 隨捲動離場時,加入**細膩雙層視差**,產生電影景深感,提升進站第一印象。使用 GSAP + ScrollTrigger(使用者本意:開始用 GSAP,並作為日後 pin/scrub 的地基)。

## 效果(僅桌機 ≥981px)

隨捲動進度(hero 從滿版 → 完全捲出視窗,進度 0→1):

| 層 | 動畫 |
|---|---|
| 鋼琴家照 `.heroPhoto` | `y: 0 → +8%`(緩慢下移)、`scale: 1 → 1.08`(微放大) |
| 左側內容(標題/文字/offer 卡) | `y: 0 → -50px`(稍快上移)、`opacity: 1 → 0.35`(淡出) |

兩層不同速度 → 景深感;幅度克制、精品調。

## 技術

- **GSAP + ScrollTrigger**,`scrub: true`(進度綁捲動位置,非時間)。
- ScrollTrigger:`trigger = hero`、`start: "top top"`、`end: "bottom top"`。
- **`gsap-react` 的 `useGSAP()`** hook 掛載/自動清理(SSR 安全、離開 revert)。
- **`gsap.matchMedia()`** 條件:`(min-width: 981px) and (prefers-reduced-motion: no-preference)`。
  - 手機不做(堆疊版視差意義不大)。
  - 尊重「減少動態」(呼應 [[project_inrecord_homepage_design]] 的 hydration/a11y 守則)。

## 邊界與注意

- **只動 Hero**;不改結構、文字、offer 卡功能。
- **framer 分工**:framer 管「進場 stagger 淡入」、GSAP 管「離場視差」。
- **transform 衝突**:`.heroIntro` 有 framer `variants`(進場設 inline transform)。GSAP 對內容的位移/淡出**作用在另一層 wrapper**(不與 framer 動同一元素的 transform),避免打架。
- SSR 安全:動畫只在 client `useGSAP` 內執行;不影響首屏 SSR/hydration。

## 代價

- 新增 `gsap` 依賴(package.json,~50–70KB gzip)。

## 不做(YAGNI)

- pin/scrub 區塊、其他頁面、行動版視差、其他區塊的 reveal 改造(維持現有 framer)。

## 驗收

- 桌機捲動:照片下移+微放大、內容上移+淡出,順暢無跳。
- 手機:無視差(靜態)。
- `prefers-reduced-motion: reduce`:無視差(靜態)。
- hydration pageerror = 0(webapp-testing 驗)。
