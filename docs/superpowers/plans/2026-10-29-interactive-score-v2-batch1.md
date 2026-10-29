# 互動樂譜 v2 第一批 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 學員在單元播放頁「樂譜」分頁練老師編好的雙手 MusicXML 譜（五線譜／簡譜／對照、播放、A-B 循環、虛擬鍵盤），後台「曲目」分頁可上傳、預覽、發布、下架、替換、掛單元。

**Architecture:** 一支純函式解析器把 MusicXML 轉成「v2 模型」（`lib/score/musicxml.js`），簡譜排版、播放時間軸、和弦級數、五線譜前處理都只吃這份模型、共用同一組音符 id。五線譜交給 OpenSheetMusicDisplay（OSMD）畫，畫完再用純函式把 OSMD 的音符 SVG 對回模型 id，供高亮與提示框使用。資料庫只做加法：擴充 `scores` 表＋新表 `score_units`（曲目↔單元多對多）；舊 ABC 小蜜蜂走原本的元件，完全不動。

**Tech Stack:** Next.js 14 App Router、React 18、Supabase、Vitest 4；新增 `opensheetmusicdisplay`、`@xmldom/xmldom`、`fflate`。

**Spec:** `docs/superpowers/specs/2026-10-29-interactive-score-v2-design.md`（本批範圍，衝突時以它為準）＋ `docs/superpowers/specs/2026-10-24-interactive-scores-v2-design.md`（§5 第一批細節、§3 反目標）。畫面樣板：`docs/superpowers/specs/assets/2026-10-29-score-prototype.html`（以下稱「原型」，CSS 在第 14–242 行、控制列在 243–339 行、圖示在 345–370 行）。

## Global Constraints

- 基底分支 `origin/audit/2026-09-20`；本計畫的工作分支是 `feat/interactive-score-v2-batch1`。不從 `master` 開工。
- 功能開關沿用 `INTERACTIVE_SCORES=on`，只設在 Vercel Preview；正式站行為必須完全不變。
- Preview 與正式站共用同一個 Supabase：資料庫變更只能加法、SQL 必須 idempotent；**SQL 先給 Alan 看，Alan 同意後才由 Claude 透過 Supabase 執行，執行完查一次資料**。
- 舊 ABC 路徑（`lib/score/abc.js`、`jianpu.js`、`playback.js`、`scorePlayer.js`、現有 `ScoreTab` 畫面）在新版確認前不刪、不改行為；1-2 單元的舊小蜜蜂樂譜分頁不能消失。
- 付費譜內容（MusicXML、解析後資料）只經 `/api/classroom/scores`（`requireClassroomAuth` 驗 JWT＋開通）；新表 RLS 只開 service_role。
- 函式庫與音源自家打包或放 `/public`，不改 `next.config.js` 的 CSP。
- 只收 `.musicxml` 與 `.mxl`；譜必須是鋼琴大譜表兩行（上＝右手 staff 1、下＝左手 staff 2）。不支援的元素略過不畫，匯入時列出警告；不是 MusicXML 或不是兩行譜就擋下。
- 學員端版面、控制列分組、圖示、提示框照原型；拿掉「左手伴奏」型態選擇、「節奏斜線」；「顯示左手」改成「只看右手」（預設雙手）。等待模式、MIDI 不做。
- 純邏輯放 `lib/score/`，用 Vitest 測（沿用 `lib/score/*.test.js` 風格，中文測試名）。
- 不部署正式站；push 後依 `開發流程.md` 手動部署 preview。Vercel 指令一律帶 `-Q /Users/zhoubolong/.vercel-inrecmusic`，且從 repo 樹外的 checkout 部署（worktree 內部署會誤傳主 checkout）。
- 下載外部檔案（鋼琴取樣）前先問 Alan。Claude 不輸入密碼、不建帳號；preview 由 Alan 自己登入。

## Review Focus

1. **SQL 還沒跑（或跑到一半）就部署了程式**：`scores.format`／`musicxml` 欄位或 `score_units` 表不存在時，學員 API 與 bootstrap 要照舊回舊 ABC 小蜜蜂，不能整個變空或 500。→ Task 9 測試 `degrades when v2 columns are missing`。
2. **`scores.published` 預設是 TRUE**：後台新建曲目若沒明寫 `published:false`，上傳當下就對 preview 學員可見。→ Task 8 測試 `POST inserts as draft`。
3. **譜裡沒有任何 `<harmony>`**：和弦標示整組控制要隱藏、簡譜不留和弦列空白、五線譜不插文字。→ Task 2「沒有和弦」、Task 6（不留和弦列）、Task 13 `hides chord control`。
4. **弱起小節（pickup，`implicit="yes"`、小節號 0）**：小節長度要用實際內容而非拍號；A-B 循環的小節編號、預備拍、節拍器重拍都要對齊。→ 壓力測試檔第一小節是弱起，Task 2「弱起小節」與 Task 5「弱起」各有測試。
5. **手機寬度或旋轉後 OSMD 重新排版**：重畫後舊的音符元素對照表失效，高亮會亮錯或不亮。→ Task 11 關掉 OSMD `autoResize`、自己用 ResizeObserver 重畫並每次重建對照表；Task 11 Step 5 在 375px 寬實測播放高亮。

---

## 檔案地圖

| 檔案 | 責任 |
|------|------|
| `lib/score/fixtures/*.musicxml`、`*.mxl`、`make-fixtures.mjs` | 自製測試檔（§8） |
| `lib/score/musicxml.js` | MusicXML → v2 模型＋警告／錯誤；`SUPPORT` 常數（說明文件與驗證共用） |
| `lib/score/mxl.js` | `.mxl` 解壓取出主 XML |
| `lib/score/chords.js` | 和弦名、級數、組成音、鍵盤和弦辨識、音名／簡譜字（自原型移植） |
| `lib/score/timeline.js` | 演奏順序（反覆展開）、播放事件、節拍器、預備拍、A-B、`activeIdsAt` |
| `lib/score/jianpu-grand.js` | 雙行簡譜 SVG（沿用 `jianpu.js` 的 `beamCount/dashCount/isDotted/groupByBeat`） |
| `lib/score/staff-xml.js` | 給 OSMD 的 XML 前處理（只看右手、和弦文字）＋音符對照 |
| `lib/score/unit-scores.js` | 學員 API／bootstrap 合併舊 ABC 與 v2 曲目 |
| `lib/score/admin-input.js` | 後台輸入正規化與驗證 |
| `supabase-scores-v2.sql` | 加欄位＋`score_units` |
| `app/api/admin/scores/route.js` | 後台曲目 CRUD |
| `app/api/classroom/scores/route.js`、`app/api/classroom/bootstrap/route.js` | 學員端讀取（修改） |
| `public/score-piano/*.mp3`、`LICENSE.txt` | 雙手音域鋼琴取樣 |
| `components/classroom/score/pianoSampler.js`、`grandPlayer.js` | 取樣發聲、排程播放、節拍器 |
| `components/classroom/score/StaffView.jsx` | OSMD 包裝：載入、重畫、對照表、高亮 |
| `components/classroom/score/JianpuView.jsx`、`ScoreTip.jsx`、`PianoKeys.jsx` | 簡譜、提示框、虛擬鍵盤 |
| `components/classroom/score/InteractiveScore.jsx`、`score-css.js` | 整個學員畫面（後台預覽共用） |
| `components/classroom/ScoreTab.jsx` | 依 `format` 分流：舊 ABC 畫面／新元件 |
| `app/admin/ScoresManagePage.jsx`、`app/admin/CourseDetailPage.jsx` | 後台「曲目」分頁 |
| `docs/樂譜匯出說明-給Rick.md` | 給 Rick 的匯出說明（桌面再放一份） |

## v2 模型（Task 2 產出，之後所有任務共用）

```js
/** @typedef {{ step:'C'|'D'|'E'|'F'|'G'|'A'|'B', alter:number }} Spelled */
ScoreModel = {
  title: string, composer: string|null,
  tempo: number|null,                 // 四分音符 BPM（<sound tempo> 或 <metronome>）
  measures: [{ index, number,         // index 從 0 起；number 是 XML 的 number 屬性（弱起常為 "0"）
    length,                           // 實際長度（四分音符＝1），弱起以內容計
    implicit: boolean,
    key: { fifths:number, mode:'major'|'minor', tonic: Spelled },
    time: { beats:number, beatType:number },
    repeatStart: boolean, repeatEnd: boolean, repeatTimes: number,  // 預設 2
    ending: { numbers:number[], type:'start'|'stop'|'discontinue' }|null }],
  notes: [{ id:'n0', measure, staff:1|2, voice:string,
    onset, dur,                       // 四分音符為單位、相對小節起點
    rest: boolean, midi: number|null, pitch: Spelled & { octave:number }|null,
    tieStart: boolean, tieStop: boolean, dots: number,
    tuplet: { actual:number, normal:number }|null }],   // id 依 (measure, staff, onset, midi) 排序編號
  chords: [{ id:'c0', measure, onset, root: Spelled, kind:string, bass: Spelled|null, name:string }],
  hasChords: boolean,
  warnings: [{ code:string, message:string, measure?:number }],
}
```

---

### Task 1: 依賴與自製測試檔

**Files:**
- Modify: `package.json`、`package-lock.json`
- Create: `lib/score/fixtures/twinkle-grand.musicxml`、`stress.musicxml`、`stress.mxl`、`single-staff.musicxml`、`not-musicxml.xml`、`make-fixtures.mjs`
- Test: `lib/score/fixtures/fixtures.test.js`

**Interfaces:**
- Produces: 上述檔案路徑；`make-fixtures.mjs` 由 `stress.musicxml` 產生 `stress.mxl`（`META-INF/container.xml` 指向 `score.musicxml`）。

- [ ] **Step 1: 安裝依賴**：`npm i opensheetmusicdisplay @xmldom/xmldom fflate`，各取「至少兩週前發布」的最新版並在 `package.json` 釘精確版本（不用 `^`）。`npm ls` 無 peer 錯誤。
- [ ] **Step 2: 手寫 `twinkle-grand.musicxml`**：MusicXML 4.0 partwise、單一 part、`<staves>2</staves>`、C 大調 4/4、`<sound tempo="96"/>`；右手小蜜蜂旋律 8 小節（同 `supabase-scores.sql` 前兩行），左手每小節一個二分音符柱式和弦 ×2（C: C3-E3-G3，G7: G2-B2-F3），每小節開頭一個 `<harmony>`（C／G7）。用 `<backup>` 回到小節起點寫左手。
- [ ] **Step 3: 手寫 `stress.musicxml`**（每項都要出現，並在檔頭 XML 註解列出所在小節）：第 1 小節弱起（`implicit="yes"`、`number="0"`、一拍）；G 大調、第 9 小節起轉 F 大調；4/4 段落後第 5–6 小節 3/4、第 7 小節 6/8；八分、十六分、附點四分、附點八分；跨小節連結線；臨時升降與還原；休止；右手雙音、左手三音同時按；和弦名含 `D7`、`Cmaj7`、`Em`、`C/E`（`<bass>`）、`Bdim`；第 2–3 小節 `|: :|` 加第一、二結尾；一組八分三連音；一個 `<pedal>`、一個 `<dynamics>`、一個 `<grace/>` 音（用來測警告）；第 11 小節右手兩個 voice 節奏不同。
- [ ] **Step 4: `single-staff.musicxml`**（只有一行譜的旋律）與 `not-musicxml.xml`（任意非 MusicXML 的 XML，例如 `<svg/>`）。
- [ ] **Step 5: 寫 `make-fixtures.mjs` 並執行**：`node lib/score/fixtures/make-fixtures.mjs` 用 `fflate.zipSync` 產生 `stress.mxl`。
- [ ] **Step 6: 寫測試** `fixtures.test.js`：每個 `.musicxml` 能被 `@xmldom/xmldom` 解析且無 parsererror；`stress.mxl` 是 zip（前兩位元組 `PK`）。
- [ ] **Step 7: 跑** `npx vitest run lib/score/fixtures` → PASS
- [ ] **Step 8: Commit** `git add package.json package-lock.json lib/score/fixtures && git commit -m "chore(scores): v2 依賴與自製 MusicXML 測試檔"`

### Task 2: MusicXML 解析器

**Files:**
- Create: `lib/score/musicxml.js`
- Test: `lib/score/musicxml.test.js`

**Interfaces:**
- Consumes: Task 1 測試檔
- Produces:
  - `parseMusicXml(xmlText: string): ScoreModel`（上方模型）
  - `class ScoreError extends Error { code: 'not_musicxml'|'no_part'|'not_grand_staff'|'empty' }`
  - `SUPPORT = { supported: {element:string, label:string}[], ignored: {element:string, label:string}[] }`（label 是白話中文，例如 `{ element:'pedal', label:'踏板記號' }`；`ignored` 至少含 pedal、dynamics、wedge、ornaments、grace、fermata、lyric、segno／coda（不展開））

- [ ] **Step 1: 寫失敗測試**（`describe("parseMusicXml")`）：
  - `小蜜蜂雙手`：`measures.length===8`；`tempo===96`；`hasChords===true`；`chords[0].name==='C'`、`chords[1].name==='G7'`；第 0 小節 staff 1 第一個音 `midi===67, onset===0, dur===1`；第 0 小節 staff 2 有 3 個同 onset 的音、`midi` 為 `[48,52,55]`；音符 id 從 `n0` 連號、依 (measure, staff, onset, midi) 排序。
  - `弱起小節`：stress 的 `measures[0]` → `implicit===true, number==='0', length===1`；`measures[1].length===4`。
  - `調號與轉調`：`measures[1].key.fifths===1`；第 9 小節（index 依實際檔）`key.fifths===-1`、`tonic` 為 F。
  - `拍號`：3/4 小節 `length===3`、6/8 小節 `length===3`。
  - `連結線`：跨小節那對音 `tieStart`/`tieStop` 正確。
  - `三連音`：三個音 `dur` 各為 1/3、`tuplet` 為 `{actual:3, normal:2}`。
  - `和弦名`：`C/E` 的 `bass` 為 E、`name==='C/E'`；`Cmaj7`、`Bdim`、`Em`、`D7` 名稱正確（名稱規則：根音＋`m`/`7`/`maj7`/`m7`/`dim`/`aug`/`sus2`/`sus4`/`6`，升降用 `#`/`b`，有 bass 加 `/X`）。
  - `反覆與結尾`：第 2 小節 `repeatStart`、第 3 小節 `repeatEnd`；結尾小節的 `ending.numbers` 為 `[1]`／`[2]`。
  - `警告`：stress 的 `warnings` 含 code `ignored_element`（訊息分別點名踏板、表情記號、裝飾音）與 `multi_voice`（帶 `measure`）；小蜜蜂 `warnings.length===0`。
  - `沒有和弦`：把小蜜蜂的 `<harmony>` 全部移除後 `hasChords===false`、`chords.length===0`。
  - `擋下`：`single-staff` 丟 `ScoreError` code `not_grand_staff`；`not-musicxml` 丟 `not_musicxml`；空字串丟 `empty`。
  - `多 part`：兩個 part 時只取第一個，`warnings` 含 `multi_part`。
- [ ] **Step 2: 跑** `npx vitest run lib/score/musicxml.test.js` → FAIL（模組不存在）
- [ ] **Step 3: 實作** `parseMusicXml`：`new DOMParser()`（`@xmldom/xmldom`）；依 `<divisions>` 換算四分音符；逐 `<measure>` 走子元素維護游標（`<backup>`/`<forward>` 移動、`<chord/>` 不前進）；`midi = (octave+1)*12 + 音階半音 + alter`；小節 `length` 取該小節所有 staff 的最大游標位置；`<harmony>` 的 onset 用當下游標（含 `<offset>`）。`<score-timewise>` 擋為 `not_musicxml`（訊息請 Alan 改匯出 partwise）。
- [ ] **Step 4: 跑測試** → PASS
- [ ] **Step 5: Commit** `git commit -m "feat(scores): MusicXML 解析成 v2 模型（雙手、和弦、反覆、警告）"`

### Task 3: `.mxl` 解壓

**Files:**
- Create: `lib/score/mxl.js`
- Test: `lib/score/mxl.test.js`

**Interfaces:**
- Produces: `extractMxl(bytes: Uint8Array): string`（主 XML 文字）；`readScoreFile(name: string, bytes: Uint8Array): string`（依副檔名分流，`.musicxml`/`.xml` 用 `TextDecoder` 解 UTF-8，`.mxl` 呼叫 `extractMxl`，其他副檔名丟 `ScoreError('not_musicxml')`）

- [ ] **Step 1: 寫失敗測試**：`extractMxl(stress.mxl)` 經 `parseMusicXml` 後與直接解析 `stress.musicxml` 的 `notes.length` 相同；container.xml 缺失時改取 zip 內第一個非 `META-INF/` 的 `.xml`/`.musicxml`；壞 zip 丟 `ScoreError` code `not_musicxml`；`readScoreFile("a.pdf", …)` 丟 `not_musicxml`。
- [ ] **Step 2: 跑** → FAIL
- [ ] **Step 3: 實作**（`fflate.unzipSync`；rootfile 路徑讀 `META-INF/container.xml` 的 `<rootfile full-path>`）
- [ ] **Step 4: 跑** → PASS
- [ ] **Step 5: Commit** `git commit -m "feat(scores): 讀取 .mxl 壓縮檔"`

### Task 4: 和弦與音名工具

**Files:**
- Create: `lib/score/chords.js`
- Test: `lib/score/chords.test.js`

**Interfaces:**
- Consumes: 模型的 `chords[]`、`measures[].key`
- Produces:
  - `chordTones(chord): number[]`（MIDI，根音在 C3–B3 附近，slash 和弦 bass 放最低）
  - `romanOf(chord, key): string`（以 `key.tonic` 為 I；規則移植原型第 455–472 行 `roman()`：小三／小七／減和弦小寫、`°`、`+`、轉位數字上標）
  - `chordZh(chord): string`（大三和弦、小三和弦、屬七和弦…，移植原型第 426–428 行 `CQ`）
  - `recognizeChord(midis: number[]): { name:string, zh:string } | null`（移植原型第 948–972 行 `QUAL`/`recognize`）
  - `noteName(midi, key?): string`（例 `E4`；依調號拼升或降）、`jianpuDigit(pitch, key): { digit:'1'..'7', acc:''|'♯'|'♭', octave:number }`（`octave` 相對主音所在八度：主音 C4 時 C5 為 1）

- [ ] **Step 1: 寫失敗測試**：C 大調 `romanOf(C)==='I'`、`G7==='V7'`、`Am==='vi'`、`C/E==='I⁶'`；G 大調 `romanOf(D7)==='V7'`、`Em==='vi'`；F 大調 `Bb==='IV'`；`recognizeChord([60,64,67]).name==='C'`、`[62,65,69]→'Dm'`、`[67,71,74,77]→'G7'`、兩個音回 `null`；`noteName(61, G 大調)==='C♯4'`、`noteName(70, F 大調)==='B♭4'`；`jianpuDigit(G4, G 大調)` → `digit '1', octave 0`、`F♯4` → `'7', octave -1`。
- [ ] **Step 2: 跑** → FAIL
- [ ] **Step 3: 實作**
- [ ] **Step 4: 跑** → PASS
- [ ] **Step 5: Commit** `git commit -m "feat(scores): 和弦級數、組成音、鍵盤和弦辨識"`

### Task 5: 播放時間軸

**Files:**
- Create: `lib/score/timeline.js`
- Test: `lib/score/timeline.test.js`

**Interfaces:**
- Consumes: `ScoreModel`
- Produces:
  - `playOrder(model): number[]`：展開 `|: :|`（`repeatTimes`）與第一／第二結尾後的小節 index 順序；segno／coda 不展開（已在 Task 2 警告）
  - `buildPlayback(model, { bpm, hands:{rh:boolean, lh:boolean}, loop:{from:number,to:number}|null, countIn:boolean, metronome:boolean }): Playback`
  - `Playback = { events:[{ midi, staff, at, dur, segs:[{ id, at }] }], clicks:[{ at, accent:boolean }], duration, countIn:number, measureTimes:[{ measure, at }] }`（秒；`segs` 是連結線合併後各段音符的 id 與起點；`countIn` 是預備拍長度，事件時間已含它）
  - `activeIdsAt(playback, t): Set<string>`（正在響的每個事件取「涵蓋 t 的那一段」的 id）
  - `DEFAULT_BPM = 84`

- [ ] **Step 1: 寫失敗測試**：
  - `反覆展開`：stress 的 `playOrder` 在反覆段呈現「…2,3(第一結尾),2,4(第二結尾)…」（依實際小節 index 寫死期望陣列）。
  - `連結線合併`：跨小節的 tie 變成一個事件、`segs.length===2`、`dur` 為兩段相加。
  - `單手靜音`：`hands:{rh:true,lh:false}` 時沒有 `staff===2` 的事件；但 `measureTimes` 不變。
  - `速度`：小蜜蜂 `bpm:120` 第 1 小節第 2 個音 `at===0.5`。
  - `預備拍`：`countIn:true` 時第一個事件 `at` 等於一整小節（4/4、bpm 60 → 4 秒），`clicks` 前 4 個在預備拍內、第 1 個 `accent`。
  - `弱起`：stress `countIn:true` 的預備拍是**一整個正常小節**（依第 2 小節拍號），弱起音緊接在後；節拍器重拍落在第 2 小節起點而不是弱起起點。
  - `A-B 循環`：`loop:{from:2,to:3}` 只含第 2–3 小節的事件、時間從預備拍後的 0 起算、不走反覆展開。
  - `activeIdsAt`：小蜜蜂 `t` 在第一個音中間 → 含 `n0`；同時按的左手和弦三個 id 都在。
- [ ] **Step 2: 跑** → FAIL
- [ ] **Step 3: 實作**
- [ ] **Step 4: 跑** → PASS
- [ ] **Step 5: Commit** `git commit -m "feat(scores): 雙手播放時間軸（反覆、預備拍、節拍器、A-B 循環）"`

### Task 6: 雙行簡譜

**Files:**
- Create: `lib/score/jianpu-grand.js`
- Test: `lib/score/jianpu-grand.test.js`

**Interfaces:**
- Consumes: `ScoreModel`；`jianpu.js` 的 `beamCount/dashCount/isDotted/groupByBeat`（不修改 `jianpu.js`）；Task 4 的 `jianpuDigit`、`romanOf`
- Produces: `renderGrandJianpu(model, { width:number, chordMode:'name'|'roman'|'both', showChords:boolean, rightHandOnly:boolean }): { svg:string, height:number }`。每個音符 `<g class="jp-note" data-id="n12">`；和弦標示 `<g class="jp-chord" data-chord="c3">`；同 staff 同 onset 的音上下堆疊（高音在上）；每系統右手行在上、左手行在下，兩行小節線對齊；左上角 `1=G 4/4`，轉調／變拍的小節再標一次；三連音畫一個「3」。

- [ ] **Step 1: 寫失敗測試**：小蜜蜂輸出含 `data-id="n0"` 到最後一個 id（`notes` 中非休止與休止都有 `data-id`）；左手和弦三個 `data-id` 的 x 座標相同、y 不同；`rightHandOnly:true` 時不含任何 staff 2 的 id；`showChords:false` 或 `hasChords===false` 時沒有 `jp-chord` 且 `height` 比有和弦時小（不留空白列）；`chordMode:'roman'` 出現 `V7`、`'both'` 同時出現 `G7` 與 `V7`；stress 輸出含 `1=G` 與 `1=F`、含 `3/4`；`width:320` 時每行小節數少於 `width:960`；所有文字經跳脫（曲名或和弦名含 `<` 不會產生新標籤）。
- [ ] **Step 2: 跑** → FAIL
- [ ] **Step 3: 實作**（多聲部小節只畫該 staff 的第一個 voice，其餘略過——Task 2 已警告）
- [ ] **Step 4: 跑** → PASS
- [ ] **Step 5: Commit** `git commit -m "feat(scores): 雙手簡譜排版（和弦堆疊、雙行對齊、調號）"`

### Task 7: 給 OSMD 的 XML 前處理與音符對照

**Files:**
- Create: `lib/score/staff-xml.js`
- Test: `lib/score/staff-xml.test.js`

**Interfaces:**
- Consumes: `ScoreModel`、Task 4 `romanOf`
- Produces:
  - `prepareStaffXml(xmlText, model, { rightHandOnly:boolean, chordMode:'name'|'roman'|'both', showChords:boolean }): string`——一律移除 `<harmony>`，`showChords` 時在原位置換成 staff 1、`placement="above"` 的 `<direction><direction-type><words>` 文字（name／roman／`G7 (V7)`）；`rightHandOnly` 時刪掉 staff 2 的 `<note>`、`<forward>`、`<clef number="2">`，`<staves>` 改 1。【Claude 的判斷】和弦全由這裡產生文字，三種標示模式走同一條路，不依賴 OSMD 的和弦記號繪製。
  - `matchStaffNotes(model, rendered: {measure:number, staff:number, onset:number, midi:number|null, el:Element}[]): Map<string, Element[]>`——以 (measure, staff, onset 取到 1/96 拍, midi) 配對；配不到的記數回傳在 `map.unmatched`（number）。

- [ ] **Step 1: 寫失敗測試**：處理後的小蜜蜂 XML 再用 `parseMusicXml` 解析，`notes` 數不變、`hasChords===false`、有 8 個 `<words>`；`rightHandOnly` 後解析會丟 `not_grand_staff`（確認左手已刪），直接用 xmldom 查無 `<staff>2</staff>`；`chordMode:'both'` 第一個 words 為 `C (I)`；`matchStaffNotes` 用模型自己產生的假 `rendered`（每個音一個假元素）→ 全部配對、`unmatched===0`；把一個假元素 onset 偏 0.001 拍仍配對、偏 0.1 拍則 `unmatched===1`。
- [ ] **Step 2: 跑** → FAIL
- [ ] **Step 3: 實作**（xmldom 解析與 `XMLSerializer` 輸出）
- [ ] **Step 4: 跑** → PASS
- [ ] **Step 5: Commit** `git commit -m "feat(scores): OSMD 前處理（只看右手、和弦文字）與音符對照"`

### Task 8: 資料庫與後台 API

**Files:**
- Create: `supabase-scores-v2.sql`、`lib/score/admin-input.js`、`app/api/admin/scores/route.js`
- Modify: `supabase-deploy.sql`（末尾加註「另需執行 supabase-scores-v2.sql」或併入，依檔內慣例）、`CLAUDE.md`（部署 SQL 清單、主要 API 路由表）
- Test: `lib/score/admin-input.test.js`、`app/api/admin/scores/route.test.js`

**Interfaces:**
- Consumes: Task 2 `parseMusicXml`、`ScoreError`
- Produces:
  - SQL：`scores` 加 `format TEXT NOT NULL DEFAULT 'abc'`（`'abc'|'musicxml'`）、`musicxml TEXT`、`difficulty SMALLINT`（1 入門／2 初級／3 中級，可 NULL）、`meta JSONB`、`version INTEGER NOT NULL DEFAULT 1`、`file_name TEXT`；`abc` 改可 NULL；用 `DO $$ … $$` 冪等加 CHECK `(format='abc' AND abc IS NOT NULL) OR (format='musicxml' AND musicxml IS NOT NULL)`；新表 `score_units(score_id UUID REFERENCES scores ON DELETE CASCADE, video_id UUID REFERENCES videos ON DELETE CASCADE, sort_order INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY(score_id, video_id))`、`video_id` 索引、RLS 只給 service_role（比照 `supabase-scores.sql`）。`subtitle` 沿用為「作者／出處」。
  - `normalizeScoreInput(body, { partial:boolean }): { fields, unitIds, errors:string[] }`——白名單 `title, subtitle, difficulty, musicxml, file_name, published, sort_order`；`musicxml` 有給就跑 `parseMusicXml`，成功時 `fields.meta = { title, tempo, key, time, measureCount, hasChords, warnings }`，失敗把 `ScoreError.code` 放進 `errors`。
  - `/api/admin/scores`：`GET`（列表：含舊 ABC 列與 v2 列、各列 `units:[{video_id,title}]`，不回 `musicxml` 全文；`?id=` 回單筆含 `musicxml`）、`POST`（新建，**一律 `format:'musicxml', published:false`**，寫 `score_units`）、`PATCH`（`id` 必填；`musicxml` 有變時 `version+1`；`unitIds` 有給就整批換掉該曲的 `score_units`；`format==='abc'` 的列只允許改 `published`）、`DELETE`（只刪 `format==='musicxml'` 且未發布的草稿）。全部 `verifyAdminToken`；寫入動作 `logAudit`（`score.create|update|publish|unpublish|delete`）。

- [ ] **Step 1: 寫失敗測試**（`admin-input.test.js`）：缺 `title` → errors；`difficulty: 5` → errors；`musicxml` 是 single-staff → errors 含 `not_grand_staff`；小蜜蜂 → `fields.meta.measureCount===8`、`hasChords===true`；白名單外欄位（`format`、`abc`、`version`）被丟掉。
- [ ] **Step 2: 寫失敗測試**（`route.test.js`，比照 `app/api/admin/early-access/route.test.js` 用 `makeSupabaseMock`）：`POST inserts as draft`（insert 參數 `published===false`、`format==='musicxml'`）；`POST` 帶 `unitIds` 會寫 `score_units`；`PATCH` 換 `musicxml` → update 含 `version: 舊值+1`；`PATCH` 對 abc 列送 `title` → 400；`DELETE` 已發布 → 409；未登入 → 401。
- [ ] **Step 3: 跑** → FAIL
- [ ] **Step 4: 實作** SQL、`normalizeScoreInput`、route
- [ ] **Step 5: 跑** `npx vitest run lib/score/admin-input.test.js app/api/admin/scores` → PASS
- [ ] **Step 6: Commit** `git commit -m "feat(scores): 曲目資料表擴充與後台曲目 API"`
- [ ] **Step 7: 把 `supabase-scores-v2.sql` 全文貼給 Alan 看，等 Alan 明確同意**。同意後用 Supabase MCP `execute_sql` 執行；再查 `select id, title, format, published, video_id from scores` 與 `select count(*) from score_units` 確認舊小蜜蜂仍是 `format='abc', published=true`。結果回報給 Alan。

### Task 9: 學員端讀取（API＋bootstrap）

**Files:**
- Create: `lib/score/unit-scores.js`
- Modify: `app/api/classroom/scores/route.js`、`app/api/classroom/bootstrap/route.js:102-105, 156-160`
- Test: `lib/score/unit-scores.test.js`、`app/api/classroom/scores/route.test.js`

**Interfaces:**
- Consumes: Task 8 的表
- Produces:
  - `mergeUnitScores(legacyRows, linkedRows): Score[]`——依 `id` 去重、依 `sort_order` 再 `title` 排序；`Score = { id, title, subtitle, format:'abc', abc, sort_order } | { id, title, subtitle, format:'musicxml', musicxml, version, sort_order }`
  - `isMissingRelation(error): boolean`（欄位或表不存在、schema cache 訊息）
  - `GET /api/classroom/scores?video_id=` 回 `{ scores: Score[] }`：舊列查 `video_id=X, published=true` 且只選舊欄位（**不選 `format`**，以 `abc IS NOT NULL` 認定舊版）；v2 列查 `score_units`（`video_id=X`）join `scores`（`published=true, format='musicxml'`）。
  - bootstrap 的 `scoreRes.data` 合併兩種來源成 `{ id, video_id, title }[]`，讓既有「互動樂譜」側欄圖示與 `hasSheet` 不改就能用。

- [ ] **Step 1: 寫失敗測試**：`mergeUnitScores` 去重與排序；route `degrades when v2 columns are missing`（v2 查詢回 `column scores.format does not exist`／`relation "score_units" does not exist` → 仍回舊 ABC 那筆、200）；`INTERACTIVE_SCORES` 未設 → `{scores:[]}`；未開通 → `requireClassroomAuth` 擋下（沿用現有 mock 寫法）；v2 草稿（`published:false`）不出現。
- [ ] **Step 2: 跑** → FAIL
- [ ] **Step 3: 實作**（bootstrap 多一個並行查詢，錯誤走 `isMissingRelation` 降級並 `console.error`，比照檔內其他區塊）
- [ ] **Step 4: 跑** `npx vitest run lib/score app/api/classroom` → PASS
- [ ] **Step 5: Commit** `git commit -m "feat(scores): 學員端讀取 v2 曲目並與舊 ABC 並存"`

### Task 10: 鋼琴取樣與播放器

**Files:**
- Create: `public/score-piano/*.mp3`、`public/score-piano/LICENSE.txt`、`components/classroom/score/pianoSampler.js`、`components/classroom/score/grandPlayer.js`
- Test: `components/classroom/score/pianoSampler.test.js`

**Interfaces:**
- Consumes: Task 5 `Playback`、`activeIdsAt`
- Produces:
  - 取樣：FluidR3_GM acoustic grand（與 `public/points/piano/` 同來源），每小三度一個：`C2 Eb2 Gb2 A2 … C7`（21 檔），檔名照此。**下載前先問 Alan**（說明來源網址、檔數、總大小）。`LICENSE.txt` 寫明來源與授權（先查證該取樣包實際授權，若為 CC BY 3.0 要在 LICENSE 與教室頁尾／說明處標出處——查證結果回報 Alan）。
  - `nearestSample(midi): { name:string, rate:number }`（純函式：取最近取樣、`rate = 2^((midi-sampleMidi)/12)`）
  - `createPianoSampler({ base:'/score-piano/' })` → `{ ensure(): AudioContext|null, load(midis:number[]): Promise<void>, play(midi, when, dur, vel=0.8) }`（按需載入、同檔去重）
  - `createGrandPlayer(sampler)` → `{ load(playback), play(): Promise<boolean>, stop(), onTick(fn:(ids:Set<string>, t:number)=>void), onEnd(fn), dispose(), get playing }`；`loop` 有設時播完從頭再來直到 `stop()`；節拍器用原型第 793 行 `click()` 的合成音。
- [ ] **Step 1: 寫失敗測試**（只測純函式）：`nearestSample(60)` → `{name:'C4', rate:1}`；`nearestSample(62)` 取 `C4` 或 `Eb4` 中較近者且 `rate` 正確；`nearestSample(30)` 夾到 `C2`、`nearestSample(110)` 夾到 `C7`。
- [ ] **Step 2: 跑** → FAIL
- [ ] **Step 3: 實作**（`nearestSample` 與取樣名清單從 `pianoSampler.js` 匯出）
- [ ] **Step 4: 跑** → PASS
- [ ] **Step 5: Commit** `git commit -m "feat(scores): 雙手音域鋼琴取樣與排程播放器"`

### Task 11: 五線譜元件（OSMD）

**Files:**
- Create: `components/classroom/score/StaffView.jsx`、`components/classroom/score/osmd-notes.js`
- Test: `components/classroom/score/osmd-notes.test.js`

**Interfaces:**
- Consumes: Task 7 `prepareStaffXml`、`matchStaffNotes`
- Produces:
  - `collectOsmdNotes(graphic): {measure, staff, onset, midi, el}[]`——走 `graphic.MeasureList[m][s].staffEntries[].graphicalVoiceEntries[].notes[]`；`onset = staffEntry.relInMeasureTimestamp.RealValue * 4`；`midi` 由 `note.sourceNote` 的半音值換算（用小蜜蜂第一個音 G4=67 校正 offset，寫成常數並註明）；休止 `midi:null`；`el = note.getSVGGElement()`。
  - `<StaffView xml model rightHandOnly chordMode showChords activeIds onNoteHover(id|null, rect) />`：`dynamic import("opensheetmusicdisplay")`；`new OpenSheetMusicDisplay(el, { backend:'svg', autoResize:false, drawTitle:false, drawingParameters:'compacttight' })`；`load(prepareStaffXml(...))` → `render()` → 重建 `Map<id, Element[]>`；容器寬度變化（ResizeObserver，200ms debounce）時重新 `render()` 並**重建對照表**；`activeIds` 變動時對應元素加／移除 class `is-now`；`unmatched > 0` 時 `console.warn` 一次。
- [ ] **Step 1: 寫失敗測試**（`osmd-notes.test.js`，用手做的假 `graphic` 物件：兩小節、兩個 staff、一個和弦、一個休止）→ 輸出筆數、onset、midi、staff 正確。
- [ ] **Step 2: 跑** → FAIL
- [ ] **Step 3: 實作** `collectOsmdNotes` 與 `StaffView`
- [ ] **Step 4: 跑** → PASS
- [ ] **Step 5: 瀏覽器實測**（本機 `npm run dev` 開 `http://127.0.0.1:3000`，暫時用一個只在 dev 載入的測試頁或 Task 13 的元件）：小蜜蜂與 stress 都畫得出來；console 的 `unmatched` 為 0（stress 的裝飾音除外）；把視窗縮到 375px 寬後播放，亮的音仍正確。若 OSMD 有解決不了的問題（例如對照長期配不上），停下來回報 Alan，再評估 Verovio。
- [ ] **Step 6: Commit** `git commit -m "feat(scores): OSMD 五線譜元件與音符對照"`

### Task 12: 簡譜元件、提示框、虛擬鍵盤

**Files:**
- Create: `components/classroom/score/JianpuView.jsx`、`ScoreTip.jsx`、`PianoKeys.jsx`、`lib/score/keymap.js`
- Test: `lib/score/keymap.test.js`、`components/classroom/score/PianoKeys.test.jsx`

**Interfaces:**
- Consumes: Task 4、Task 6
- Produces:
  - `<JianpuView model width chordMode showChords rightHandOnly activeIds onNoteHover onChordHover />`（`dangerouslySetInnerHTML` 放 `renderGrandJianpu` 的 SVG；以 `data-id`／`data-chord` 委派 hover）
  - `<ScoreTip target />`：音符→音名（`noteName`）、簡譜、時值，並附「這一拍的和弦」一行；和弦→名稱、中文性質、級數、組成音＋小鍵盤圖（移植原型第 570–599 行 `chordTip/chordDiag`）。【Claude 的判斷】五線譜上的和弦文字是 OSMD 畫的 `<words>`，對不回模型，所以五線譜只做音符提示框（內含當拍和弦）；和弦本身的提示框在簡譜上
  - `KEYMAP: Record<string, number>`（原型第 920–923 行：`zsxdcvgbhnjm,`→48 起、`q2w3er5t6y7ui`→60 起、`9o0p`→73 起）
  - `<PianoKeys low={36} high={84} activeMidis onNote(midi) />`：點按出聲、顯示 `activeMidis`（播放中亮鍵）；「用滑鼠點選組和弦」開關（原型 `latchBtn`）、「清除」；組起來的音用 `recognizeChord` 顯示名稱；電腦鍵盤 `keydown` 依 `KEYMAP` 彈奏（焦點在輸入框時不觸發）。
- [ ] **Step 1: 寫失敗測試**：`KEYMAP.z===48`、`KEYMAP.q===60`、`KEYMAP.p===76`；`PianoKeys`（jsdom）開「組和弦」後點 C4、E4、G4 → 顯示「C」；按「清除」→ 名稱消失；焦點在 `<input>` 時按 `q` 不觸發 `onNote`。
- [ ] **Step 2: 跑** → FAIL
- [ ] **Step 3: 實作**
- [ ] **Step 4: 跑** → PASS
- [ ] **Step 5: Commit** `git commit -m "feat(scores): 簡譜元件、提示框與虛擬鍵盤"`

### Task 13: 學員互動樂譜畫面

**Files:**
- Create: `components/classroom/score/InteractiveScore.jsx`、`components/classroom/score/score-css.js`
- Modify: `components/classroom/ScoreTab.jsx`（現有畫面原封不動搬到同檔的 `LegacyAbcScore` 內部元件；外層依 `format` 分流）
- Test: `components/classroom/score/InteractiveScore.test.jsx`

**Interfaces:**
- Consumes: Task 2、5、10、11、12
- Produces: `<InteractiveScore xml title subtitle />`（後台預覽也用它）。控制列照原型分組與圖示：
  - 譜面：五線譜／簡譜／對照（`localStorage` 記住，key `inrec-score2-view`）
  - 只看右手（取代原型「顯示左手」）
  - 和弦標示：和弦名／級數／兩者＋顯示開關；`model.hasChords===false` 時整組不渲染
  - 播放：播放／停止、速度滑桿（BPM 40–160，預設 `model.tempo ?? DEFAULT_BPM`）、節拍器、預備拍、右手／左手開關
  - A-B 循環：開關＋起訖小節選單（顯示 XML 小節號 `measures[i].number`）
  - 曲名、出處（`subtitle`）、調號與拍號、速度標示；列印按鈕（沿用現有 `@media print` 規則）
  - 鍵盤區 `PianoKeys`；播放中 `activeIdsAt` 的 id 同時亮五線譜、簡譜，對應 MIDI 亮鍵盤
  - 任何設定改變（速度、手、循環、譜面）先停止播放
  - 解析失敗顯示白話錯誤（例「這份樂譜讀不出來，請通知客服」），不白屏
  - 樣式：CSS 變數放 `.score-v2`，`@media (prefers-color-scheme: dark)` 換控制列配色；譜紙區維持白底黑字（【Claude 的判斷】樂譜跟紙本一樣白底較好讀）；寬度 < 640px 時控制列換行、鍵盤可橫向捲動。
- [ ] **Step 1: 寫失敗測試**（jsdom；`vi.mock` 掉 `StaffView` 與 `grandPlayer`）：用小蜜蜂 → 顯示曲名、「五線譜／簡譜／對照」三個按鈕、和弦標示組；用移除 harmony 的小蜜蜂 → `hides chord control`；沒有「左手伴奏」「節奏斜線」「顯示左手」字樣、有「只看右手」；解析失敗的 XML → 顯示錯誤文字不丟例外。`ScoreTab` 測試：`format:'abc'` 渲染舊畫面（出現舊文案「只有右手旋律」）、`format:'musicxml'` 渲染新元件。
- [ ] **Step 2: 跑** → FAIL
- [ ] **Step 3: 實作**
- [ ] **Step 4: 跑** `npm test` → 全部 PASS
- [ ] **Step 5: 本機實測**：dev server 上用 Task 8 API 建一筆草稿並暫時發布到一個測試單元（或用後台預覽，Task 14 完成後），逐項看 spec §4 清單；深色模式與 375px 寬各看一次。
- [ ] **Step 6: Commit** `git commit -m "feat(scores): 學員端雙手互動樂譜畫面"`

### Task 14: 後台「曲目」分頁

**Files:**
- Create: `app/admin/ScoresManagePage.jsx`
- Modify: `app/admin/CourseDetailPage.jsx`（分頁列在「遊戲」旁加 `{ id:"scores", label:"曲目" }`，圖示用 `lucide-react` 的 `Music`）
- Test: `app/admin/ScoresManagePage.test.jsx`

**Interfaces:**
- Consumes: Task 3 `readScoreFile`、Task 2 `parseMusicXml`、Task 8 API、Task 13 `InteractiveScore`；單元清單沿用 `GamesManagePage` 取章節／單元的端點與 `adminFetch`
- Produces: 列表欄位：曲名、難度、狀態（草稿／已發布）、掛在哪些單元、最後更新；舊 ABC 列加「舊版 ABC」標籤、只有發布／下架按鈕。新增／編輯表單：曲名、作者／出處、難度（入門／初級／中級）、選檔（`.musicxml,.mxl`）→ 瀏覽器端 `readScoreFile`＋`parseMusicXml`，錯誤擋下並顯示白話原因、警告逐條列出（用 `SUPPORT` 的 label）；「預覽」用 `InteractiveScore` 顯示尚未儲存的內容；單元多選；儲存、發布、下架、替換新版（換檔後 `version` 顯示 +1）、刪除草稿。
- [ ] **Step 1: 寫失敗測試**（jsdom、mock `adminFetch` 與 `InteractiveScore`）：選 single-staff 檔 → 出現「需要鋼琴大譜表兩行」錯誤、儲存鈕 disabled；選 stress 檔 → 列出踏板、表情記號、裝飾音警告；舊 ABC 列沒有「編輯」按鈕；新建送出的 body 不含 `published`（交給後端預設草稿）。
- [ ] **Step 2: 跑** → FAIL
- [ ] **Step 3: 實作**
- [ ] **Step 4: 跑** `npm test` → PASS
- [ ] **Step 5: Commit** `git commit -m "feat(admin): 曲目管理分頁（上傳、預覽、發布、掛單元）"`

### Task 15: 給 Rick 的樂譜匯出說明

**Files:**
- Create: `docs/樂譜匯出說明-給Rick.md`（完成後複製到 `~/Desktop/Claude code/InRecord/樂譜匯出說明-給Rick.md`）
- Test: `lib/score/support-doc.test.js`

**Interfaces:**
- Consumes: Task 2 `SUPPORT`、`ScoreError` codes
- [ ] **Step 1: 寫失敗測試**：讀文件全文，`SUPPORT.supported` 與 `SUPPORT.ignored` 每一個 `label` 都出現在文件中；文件提到 `.musicxml` 與 `.mxl`。
- [ ] **Step 2: 跑** → FAIL
- [ ] **Step 3: 寫文件**（白話、繁中）：MuseScore 4 的匯出路徑（檔案 → 匯出 → MusicXML，選壓縮 `.mxl` 或未壓縮 `.musicxml`）；譜要是鋼琴大譜表兩行（上右手、下左手）；和弦名用「和弦記號」（MuseScore：Ctrl/⌘+K）輸入，不能用一般文字；支援的記號清單、會被略過的清單；反覆記號與第一／二結尾會展開播放、D.S./Coda 不會；檔名規則 `單元編號_曲名_v版本.mxl`（例 `1-2_小蜜蜂_v1.mxl`）；上傳後後台會列警告。
- [ ] **Step 4: 跑** → PASS
- [ ] **Step 5: Commit** `git commit -m "docs(scores): 給 Rick 的樂譜匯出說明"`；複製到桌面資料夾。

### Task 16: 驗收與 preview

**Files:**
- Modify: `~/Desktop/Claude code/InRecord/專案資料.md`（進行中、里程碑、文件索引）

- [ ] **Step 1:** `npm test` 全部通過、`npm run build` 成功（貼出結尾輸出）。
- [ ] **Step 2:** 確認正式站行為不變：`INTERACTIVE_SCORES` 未設時 `/api/classroom/scores` 回空、bootstrap 不帶 scores（有測試涵蓋則引用測試名）。
- [ ] **Step 3:** push 分支；依 `開發流程.md` 與 Global Constraints 部署 preview（不部署正式站）；確認 preview 有 `INTERACTIVE_SCORES=on`。
- [ ] **Step 4:** 給 Alan：preview 網址＋對照清單（spec §4 每一項一行、§7 第 3 項後台流程）。請 Alan 在 app 內建瀏覽器自己登入；登入後 Claude 可接手逐項檢查並回報。用 `get_page_text`／`read_page` 為主，少截圖。
- [ ] **Step 5:** 更新 `專案資料.md`：「進行中」寫明第一批完成、等 Rick 交真實檔做逐小節比對（spec §8 最後一點）；舊 ABC 小蜜蜂何時下架由 Alan 在後台換上雙手版後決定。
