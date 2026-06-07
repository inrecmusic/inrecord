# 多課程遷移計畫（chapters / videos / games 加 `course_id`）

> 現況：**單一課程架構**。`chapters / videos / games` 沒有 `course_id`，後台「管理教室」對所有課程顯示同一份內容；`enrollments` 以固定 `course_id='piano-101'` 開通；`courses` 表只是課程清單 metadata。
>
> 目標：每門課擁有獨立的章節 / 單元 / 遊戲與購買開通，後台依所選課程過濾，前台教室依購買的課程載入對應內容。

---

## 1. 影響範圍盤點

| 層 | 物件 | 現況 | 需變更 |
|----|------|------|--------|
| DB | `chapters` | 無 course_id | 加 `course_id` |
| DB | `videos` | 無 course_id（靠 chapter_id 間接） | 加 `course_id`（或沿用 chapter 推導） |
| DB | `games` | 有 `chapter_id` / `video_id`，無 course_id | 加 `course_id` |
| DB | `enrollments` | `course_id='piano-101'` 字串 | 改存 `courses.id`（UUID） |
| DB | `ratings` | `course_id='main'` 字串 | 改存 `courses.id` |
| API | `/api/admin/chapters`、`videos`、`games` | 不吃 course_id | 依 `course_id` 過濾 + 寫入 |
| API | `/api/payuni/notify` | enroll 寫死 `piano-101` | 依 order 對應課程寫入 |
| API | `/api/payuni/checkout` | plan→價格 | plan 需綁定 `course_id`（哪門課） |
| API | `/api/classroom/course`、`verify-purchase`、`games` | 單課程 | 依 course 過濾 |
| 前台 | `app/page.jsx` `PLANS` / `lib/plans.js` | 三方案無課程維度 | plan 需帶 `course_id` |
| 後台 | `GamesManagePage`、`ChaptersUnitsPage` 等 | 已接 `courseId` prop（目前忽略） | 真正用 `courseId` 查詢 |

> 好消息：後台 `CourseDetailPage` 已把 `course.id` 傳給四個子頁（`ChaptersUnitsPage / AssignmentsPage / UnitCommentsPage / CourseRatingsPage / GamesManagePage`），子頁只是還沒拿 `courseId` 去查。前端骨架已就緒。

---

## 2. 資料庫 Migration（分階段、可回溯）

### 階段 A — 加欄位（nullable，不破壞現況）

```sql
ALTER TABLE chapters ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE games    ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE videos   ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS chapters_course_idx ON chapters (course_id, sort_order);
CREATE INDEX IF NOT EXISTS videos_course_idx   ON videos (course_id);
CREATE INDEX IF NOT EXISTS games_course_idx    ON games (course_id);
```

### 階段 B — 回填（把既有資料指向預設課程）

```sql
-- 取得預設課程 id（單一課程時就是唯一那筆）
WITH c AS (SELECT id FROM courses ORDER BY created_at LIMIT 1)
UPDATE chapters SET course_id = (SELECT id FROM c) WHERE course_id IS NULL;

WITH c AS (SELECT id FROM courses ORDER BY created_at LIMIT 1)
UPDATE games SET course_id = (SELECT id FROM c) WHERE course_id IS NULL;

-- videos 可由 chapter 推導，沒有 chapter 的補預設課程
UPDATE videos v SET course_id = ch.course_id
  FROM chapters ch WHERE v.chapter_id = ch.id AND v.course_id IS NULL;
WITH c AS (SELECT id FROM courses ORDER BY created_at LIMIT 1)
UPDATE videos SET course_id = (SELECT id FROM c) WHERE course_id IS NULL;
```

### 階段 C — enrollments / ratings 從字串改 UUID

```sql
-- 新增 UUID 欄位，回填後再切換（保留舊欄位一段時間以利回溯）
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS course_uuid UUID REFERENCES courses(id);
UPDATE enrollments SET course_uuid = (SELECT id FROM courses ORDER BY created_at LIMIT 1)
  WHERE course_uuid IS NULL;  -- 舊資料全是 piano-101 → 對應預設課程
```
> ratings 的 `course_id='main'` 同理。確認程式碼全面改用 `course_uuid` 後，再 drop 舊欄位。

### 階段 D — 收尾（程式上線後）

- 視需求把 `course_id` 設為 `NOT NULL`。
- 移除 `enrollments.course_id` 舊字串欄位、改名 `course_uuid → course_id`。

---

## 3. 方案 ↔ 課程的對應（關鍵設計決策）

目前 `lib/plans.js` 的 `PLAN_CATALOG`（course/bundle/game）是**全站共用、與課程無關**。多課程後需決定：

- **選項 1（推薦・最小改動）**：plan 維持型別（course/bundle/game），但 checkout 額外帶 `courseId`；notify 依該 `courseId` 開通對應課程。價格仍可由 `PLAN_CATALOG` 決定，或改為「每門課自己的價格」（用 `courses.price` + bundle/game 加價規則）。
- **選項 2（完整）**：改成「每門課各自定義方案與售價」的 `course_plans` 表（`course_id, plan_type, price, label`）。彈性高但工程大，前台定價頁需動態渲染。

> 建議先走選項 1：`orders` 已可加 `course_id`，notify enroll 改成 `order.course_id`。

```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id);
```

---

## 4. 程式碼變更清單

1. **後台 API**：`/api/admin/chapters|videos|games` 的 GET/POST 加 `course_id`（query 過濾 + insert 寫入）。
2. **後台子頁**：`ChaptersUnitsPage / AssignmentsPage / UnitCommentsPage / CourseRatingsPage / GamesManagePage` 把已收到的 `courseId` 帶進 fetch query。
3. **checkout**：`BuyModal` / `/api/payuni/checkout` 帶 `courseId`，寫進 `orders.course_id`。
4. **notify**：`enrollments` upsert 改用 `order.course_id`（取代寫死 `piano-101`）。
5. **前台教室**：`/api/classroom/course|verify-purchase|games` 依 `course_id` 過濾；教室頁支援切換/載入指定課程。
6. **前台定價**：`app/page.jsx` 的 `PLANS` 加上 `courseId`（或改抓 `courses`）。

---

## 5. 建議執行順序（低風險）

1. 階段 A 加欄位（nullable）→ 不影響線上。
2. 部署後台 API + 子頁「**寫入** course_id、但查詢仍相容 null」。
3. 階段 B/C 回填。
4. 切換查詢為「依 course_id 過濾」。
5. checkout/notify/前台教室接 `course_id`。
6. 階段 D 收尾、加 NOT NULL。

> 每階段都可獨立部署與回溯；先讓「寫入」就緒、資料回填完成，最後才切「讀取」過濾，避免線上學員看不到內容。

---

## 6. 風險與注意

- **既有學員存取**：回填務必把舊 `enrollments`（piano-101）對應到預設課程，否則已購學員會失去存取。上線後抽查幾個帳號的 verify-purchase。
- **遊戲存取（subscriptions）**：目前以 email 綁定、與課程無關（買斷 bundle/game）。多課程後若要「遊戲也分課」需另議；預設維持全站遊戲存取不變。
- **發票 / 退款**：不受影響（以 order 為單位）。
- **RLS**：新欄位沿用既有 service_role policy，無需額外授權。
