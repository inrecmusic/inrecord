# 教室右側單元欄：加寬 ＋ 單元內容 icon

日期：2026-08-28
狀態：設計定案，待實作

## 問題

播放頁（`app/classroom/watch/page.jsx`）右側單元欄有兩個問題：

1. **太窄**：桌機 288px，單元標題以 `white-space: nowrap` ＋ 省略號單行截斷，長標題看不到重點。
2. **看不出單元有什麼**：講義、樂譜、互動遊戲、作業散在播放器下方的區塊與分頁裡，學員必須先點進單元才知道有沒有東西。想找「哪個單元有樂譜」只能一個個點。

## 目標

單元列直接呈現「這個單元有哪些內容」，並讓學員一步跳到該內容。

## 設計

### 1. 寬度

| | 現況 | 改為 |
|---|---|---|
| 桌機（>1024px） | `288px` | `360px` |
| 平板抽屜（≤1024px） | `min(330px, 85vw)` | `min(380px, 88vw)` |

1280px 筆電下播放器仍有約 920px，影片尺寸幾乎無感。

單元標題由單行省略號改為**兩行 clamp**（`-webkit-line-clamp: 2`），第三行才截斷。四顆 icon 佔約 102px，360px 下標題每行仍可容約 15 個中文字。

### 2. 內容 icon

單元標題右側顯示該單元實際掛載的內容，**固定順序**：📎 → 🎼 → 🎮 → 📝（先看的、再練的、最後交的）。順序固定讓學員掃第二個單元時位置感一致。

| icon | 內容 | 判定依據 | 點擊行為 |
|---|---|---|---|
| 📎 | 講義 | `materials` 有 `video_id` 相符且 `kind='handout'` | 切換單元 ＋ 捲到「📎 講義下載」區並高亮 |
| 🎼 | 樂譜 | `materials` 有 `video_id` 相符且 `kind='score'` | 切換單元 ＋ 捲到「🎼 樂譜下載」區並高亮 |
| 🎮 | 互動遊戲 | `games` 有 `video_id` 相符 | 切換單元 ＋ `setTab("games")` |
| 📝 | 作業 | `videos.assignment_desc` 非空 | 切換單元 ＋ `setTab("assignment")` |

樣式：24×24 圓角方塊、`background: #f1f5f9`、emoji 12.5px；hover 加深底色並上浮 1px；選中單元的 icon 底色改 `rgba(37,99,235,.12)`。

**顯示規則**

- 單元有掛才顯示，**沒有就不顯示、不佔位**。不使用灰色佔位符——整排都有東西的錯覺比資訊不足更糟。
- 不做「未開通遊戲時 🎮 轉灰」的升級提示。遊戲一律隨課程包販售、無單獨銷售，此狀態實務上不存在，省下一個分支與一組樣式。
- 全課程通用講義／樂譜（`materials.video_id IS NULL`）**不產生任何單元的 icon**，但仍照現況顯示在下方講義／樂譜區塊內（維持既有「（通用）」標記）。

**互動細節**

- icon 是真正的 `<button>`，可 Tab 聚焦、Enter/Space 觸發，帶 `aria-label`（「講義下載」「樂譜下載」「互動遊戲」「作業繳交」）與 `title`。
- icon 的 `onClick` 需 `stopPropagation()`，避免同時觸發外層單元列的切換（外層已會切換，重複執行會讓分頁設定被覆蓋）。
- 點單元**文字**維持現況：只切換單元、不動分頁。
- 平板／手機抽屜點完自動收起，沿用既有 `handleSelect`。

### 3. 樂譜分類（唯一的資料庫改動）

`materials` 表目前講義與樂譜混在一起（建表 SQL 註解即為「① 講義／樂譜 PDF 下載」），無欄位可區分。新增分類欄位：

```sql
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'handout';
-- 'handout' 講義 ｜ 'score' 樂譜
```

- 既有檔案全部落在 `'handout'`，行為不變；上線後在後台把樂譜那幾筆改為 `'score'`。
- 冪等，寫入 `supabase-classroom-features.sql`（沿用該檔分段 idempotent 慣例）。
- 後台 `app/admin/MaterialsManager.jsx` 上傳表單新增「類型」選單；`app/api/admin/materials/route.js` 接受並寫入 `kind`。
- 教室 `MaterialsSection` 依 `kind` 拆成兩組區塊顯示（各自有 id 供 icon 捲動定位）；某一組為空則整組不顯示。

### 4. 資料如何送到前端

作業旗標已在 `videos` 內（`bootstrap?player=1` 撈 `*`），無須額外處理。

講義／樂譜／遊戲在 `app/api/classroom/bootstrap/route.js` 既有的 `Promise.all` 中加兩個只撈索引欄位的輕查詢：

```js
supabase.from("materials").select("video_id, kind").not("video_id", "is", null),
supabase.from("games").select("video_id").not("video_id", "is", null),
```

於伺服器端彙整成 `{ [video_id]: { handout, score, game } }` 回傳（欄位名 `contentFlags`），播放頁 `videos.map` 時直接查表。

- 同一次往返、同一個 service-role client，**前端零新增請求**。
- 兩張表都小、只撈索引欄位，成本可忽略。
- 僅 `playerMode` 回傳；儀表板模式不需要。
- 沿用該檔既有容錯慣例：查詢失敗記 log、該區塊退回空物件，icon 不顯示而非整頁壞掉。

## 不做

- 不改單元列的狀態圈、進度條、章節標題樣式。
- 不改 `games` / `videos` 資料表。
- 不做 icon 的數量角標（「3 份講義」）——單元列要的是有無，不是計數。
- 不動 `/classroom` 儀表板的單元呈現。

## 改動檔案

| 檔案 | 改動 |
|---|---|
| `supabase-classroom-features.sql` | 新增 `materials.kind` 欄位（idempotent） |
| `app/api/classroom/bootstrap/route.js` | `Promise.all` 加兩個查詢、彙整 `contentFlags` |
| `app/classroom/watch/page.jsx` | 側欄寬度、標題兩行 clamp、icon 群組與點擊行為、`MaterialsSection` 依 `kind` 拆組 |
| `app/admin/MaterialsManager.jsx` | 上傳表單加「類型」選單 |
| `app/api/admin/materials/route.js` | 接受並寫入 `kind` |

## 驗證

- 播放頁四類 icon 對照後台實際資料正確顯示／隱藏。
- 點四顆 icon 各自跳到正確位置；點文字只切單元、不切分頁。
- 平板抽屜寬度與點擊後自動收起正常。
- 鍵盤 Tab 可走到 icon、Enter 可觸發。
- 依「視覺改動先 preview」慣例，部署 Vercel preview 後用真實單元標題在真機確認斷行與寬度，再上正式站。
