# 手機/平板 UI/UX — Phase 2（互動元件觸控優化）實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 讓 landing「POINT 輪播」中**真正可點**的互動元件在手機/平板上更好點，且不破壞固定高度輪播的版面。

**Architecture:** 10 個 POINT 視覺元件（`components/*.jsx` + `*.module.css`）渲染在 `PointSlide.jsx` 的視覺欄。其中**僅 4 個可點**（有事件 handler）：PianoKeyboard、ChordKeyboard（兩者已有 `touch-action: manipulation`）、ChordTechnique、NoteFlash（這兩個**缺** touch-action）。其餘 6 個（EarTraining/ChordProgression/StaffDuet/SolfegeStairs/ChordTetris/RhythmTap）為**自動播放示範、無 handler**，無觸控問題、本階段不動（YAGNI）。

**關鍵約束：** 輪播 `PointCarousel.module.css` 的 `.viewport` 是**固定高度 + `overflow: hidden`**（桌機 `clamp(440px,44vw,540px)`、≤760px=`660px`、≤420px=`600px`）。任何「加高元件」的改動都可能把 `PointSlide` 堆疊內容（資訊＋視覺＋caption＋footer）推超過固定高度而被裁切 → 需視覺確認頭部空間後才可做。

**驗收方式：** 純前端樣式，無自動視覺基建。`npm run build` + `npm test`（基線 69 通過）為硬性關卡；視覺需人工在 `localhost:3100` 捲到 `#points` 區、於手機/平板寬度逐張輪播確認（landing 用 reveal 動畫，無頭瀏覽器抓不到，必須人工或真實瀏覽器）。

**協作限制：** 在 worktree `worktree-mobile-tablet-uiux`，接續 PR #8。每次 commit 前 `git branch` 確認，只 stage 本計畫列出的檔案。

---

## Task 2.1（可立即執行・零版面風險）：可點互動元件的 touch-action 一致化

**理由：** PianoKeyboard / ChordKeyboard 已用 `touch-action: manipulation`（消除手機雙擊縮放與殘留點擊延遲）。把同樣處理補到另外兩個可點元件 ChordTechnique、NoteFlash，使全部可點元件行為一致。此屬零版面影響的觸控行為改善。

**Files:**
- Modify: `components/ChordTechnique.module.css`
- Modify: `components/NoteFlash.module.css`

- [ ] **Step 1：ChordTechnique 的可點圓鈕 `.note` 加 touch-action**

在 `components/ChordTechnique.module.css` 的 `.note { … }` 規則內，現有 `cursor: pointer;` 那一行後面（或 `-webkit-tap-highlight-color: transparent;` 之後）新增一行：
```css
  touch-action: manipulation;
```
（`.note` 是 `<button>`，是此元件唯一可點目標，尺寸 `clamp(40px,5vw,52px)` 已達 ≥40px，不需改尺寸。）

- [ ] **Step 2：NoteFlash 的迷你鍵盤可點鍵加 touch-action**

NoteFlash 的可點目標是 `.white` 與 `.black`。在 `components/NoteFlash.module.css` 的 `.keyboard { … }` 規則內（容器層，子鍵的觸控手勢會繼承），於 `overflow: hidden;` 之後新增一行：
```css
  touch-action: manipulation;
```

- [ ] **Step 3：驗證**
- `grep -n "touch-action" components/ChordTechnique.module.css components/NoteFlash.module.css` → 兩檔各 1 筆。
- `npm run build` → exit 0。
- `npm test` → 69 通過。

- [ ] **Step 4：Commit（只 stage 這兩個檔）**
```bash
git branch    # 確認 worktree-mobile-tablet-uiux
git add components/ChordTechnique.module.css components/NoteFlash.module.css
git commit -m "fix(points): 互動示範元件 touch-action 一致化（ChordTechnique/NoteFlash）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git rev-parse HEAD~1
git rev-parse HEAD
```

---

## Task 2.2（暫緩・需先視覺確認，本輪不執行）：手機鍵盤加高好點

**問題：** 可點鍵盤在窄手機上偏矮 → 鍵不夠高、難精準點。
- `PianoKeyboard` / `ChordKeyboard`：`.keyboard { aspect-ratio: 448/192 }`，390px 手機（元件約 338px 寬）→ 約 145px 高。
- `NoteFlash`：`.keyboard { aspect-ratio: 448/150 }` → 約 113px 高（更矮）。

**為何暫緩：** 輪播 `.viewport` 在 ≤760px 固定 `660px`、`overflow: hidden`。`PointSlide` 在 ≤760px 把「資訊欄＋視覺欄＋caption＋footer」上下堆疊塞進這 660px。把鍵盤加高可能使總高超出 660px 而**裁切 caption/footer**。改前必須先量測手機/平板下這 660px 的剩餘頭部空間。

**待辦（視覺確認後再開工）：**
1. 在 `localhost:3100` 手機寬度捲到 `#points`，逐張看含鍵盤的 slide（POINT 鍵盤/和弦/NoteFlash）目前底部 caption/footer 是否已接近裁切邊緣、鍵盤上下是否還有空間。
2. 若有頭部空間：於各鍵盤 `.keyboard` 加 `@media (max-width: 760px) { min-height: <實測值>; }`（PianoKeyboard/ChordKeyboard 約 160–175px、NoteFlash 約 140–150px，以不撐破 660px 為準）。
3. 若無頭部空間：改為微調輪播 `.viewport` 在 ≤760px 的高度（例如 660→700px）來換取鍵盤空間，再加 `min-height`；此為版面取捨，需使用者同意。

> 本 Task 不在本輪執行；待視覺量測與使用者決定後，另以 subagent 流程補上。

---

## 自我檢查
- 僅改「可點且缺 touch-action」的 2 個元件（Task 2.1）；6 個非互動示範不動 ✅
- 高風險的鍵盤加高改動明確標為暫緩、附固定高度約束與量測步驟 ✅
- 無佔位符；每步有確切檔案/指令 ✅
