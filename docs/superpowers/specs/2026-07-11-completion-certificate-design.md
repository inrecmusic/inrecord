# 完課證書 設計文件

- 日期：2026-07-11
- 分支：`feat/point2-carousel`
- 狀態：待審查
- 屬總設計 `docs/superpowers/specs/2026-07-10-classroom-7-features-design.md` 的 ③ 項；本文件為其定案版（含測驗 farmable-pass 議題的決策）。

## 背景

七大功能最後階段 P3 的第一個。學員完成課程後可取得可列印的完課證書。總設計 ③ 曾草擬（條件＝看完影片＋通過測驗、HTML 列印頁、certificates 表）。測驗實作時浮現議題：**測驗通過可輕易刷過**（作答一次即回完整答案鍵＋重考無上限），若證書綁測驗通過，鑑別力低。

## 使用者決策（2026-07-11）

**發放條件＝看完所有影片 ＋ 通過所有測驗（沿用現狀測驗設計）。** 使用者接受測驗可刷過的權衡：證書定位為「完課證明」，仍要求每份測驗至少走過並通過一次；不為此改動測驗（不做考試模式）。

## 目標

已購課且完成課程的學員，在 `/classroom/certificate` 取得含姓名、課名、發證日、驗證碼的可列印證書；未完成則顯示還差多少。

## 非目標（YAGNI）

- 不改動測驗（不加考試模式／作答次數上限）。
- 不做伺服器端 PDF 生成（用瀏覽器 `window.print()`）。
- 不做公開驗證頁（cert_code 僅印在證書上供人工核對；未來要做驗證頁再另議）。
- 不寄送證書 email。

## 發放條件（後端權威、不信任前端）

`/api/classroom/certificate` 以 service role 蒐集下列資料，交純函式判定，**前端不可宣稱合格**：

1. **已購課**：`hasCourseAccess(admin, user.email)`；未購課 → 403。
2. **影片**：所有 `videos.published=true` 的單元，該生皆有 `progress.completed=true`（比照 `/api/classroom/progress` 已用的 `published` 過濾與 `completed` 旗標）。
3. **測驗**：所有 `quizzes.published=true`，該生皆有至少一筆 `quiz_attempts.passed=true`（依 user_id）。

三者皆滿足 → 合格。影片或測驗總數為 0 時該類別視為「無門檻」（例如尚無任何 published 測驗 → 測驗條件自動滿足），避免空課程永遠不合格；但**若影片總數為 0（課程未上架任何單元）→ 不合格**（沒有東西可完成）。

## 純函式 `lib/certificate.js`

`certificateStatus({ publishedVideoIds, completedVideoIds, publishedQuizIds, passedQuizIds }) => { eligible, videoDone, videoTotal, quizDone, quizTotal }`

- `videoTotal = publishedVideoIds.length`；`videoDone` = 其中在 `completedVideoIds` 內的數量。
- `quizTotal = publishedQuizIds.length`；`quizDone` = 其中在 `passedQuizIds` 內的數量。
- `eligible = videoTotal > 0 && videoDone === videoTotal && quizDone === quizTotal`（測驗總數為 0 時 `quizDone===quizTotal===0` 自動成立）。
- 純陣列運算、不碰 DB；有單元測試（全完成、缺影片、缺測驗、無測驗、無影片邊界）。

## 資料表 `certificates`

```sql
CREATE TABLE IF NOT EXISTS certificates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT,
  cert_code  TEXT NOT NULL UNIQUE,
  issued_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS certificates_user_uniq ON certificates (user_id);
```

RLS service_role-only（比照其他表）。**一人一張**：`user_id` 唯一索引；發放用 `insert ... on conflict (user_id) do nothing` 後再讀回，確保冪等（重複請求不換發、issued_at/cert_code 穩定）。`cert_code` 為 CSPRNG 產生的可公開驗證碼（例：`INREC-XXXXXXXX`，排除易混字）。SQL append 到 `supabase-classroom-features.sql`。

## API `/api/classroom/certificate`（GET）

- 驗登入（`getUserClient`→`getUser`）→ 401；`getSupabaseAdmin` null → 503；`hasCourseAccess` false → 403。
- 蒐集 publishedVideoIds / completedVideoIds（該生）/ publishedQuizIds / passedQuizIds（該生）→ `certificateStatus(...)`。
- **合格**：`insert certificates (user_id, email, cert_code) on conflict(user_id) do nothing` → 再 `select` 該生的 cert row（拿到穩定 cert_code/issued_at）→ 回
  `{ eligible:true, name, courseTitle:"從零開始學鋼琴", issuedAt, certCode }`。
  `name` = `user.user_metadata?.full_name || user.email?.split("@")[0]`（帳號設定的顯示名稱；與留言/評分掛名同源）。
- **不合格**：回 `{ eligible:false, videoDone, videoTotal, quizDone, quizTotal }`（不發證、不寫表）。
- **冪等/併發**：`on conflict (user_id) do nothing` 保證同一 user 併發請求只會插一筆、其餘 no-op，之後一律 `select` 該 user 既有 row → 拿到穩定 cert_code/issued_at。cert_code 為不同 user 間的隨機碰撞（CSPRNG 8 碼、機率可忽略）不在此 on-conflict 涵蓋內，萬一發生會回 500（可重試），不做額外重試邏輯（YAGNI）。

## 學員 UI

**入口**：帳號頁 `/classroom/account` 既有「修改密碼 →」區塊附近加「完課證書 →」連結到 `/classroom/certificate`。

**證書頁** `/classroom/certificate`（client component，只驗登入；未登入導 `/classroom/login`）：
- 進頁 fetch `/api/classroom/certificate`。
- **合格**：渲染 Apple 簡約風證書卡（白底、細緻排版、course/姓名/發證日/驗證碼），一顆「列印／存成 PDF」鈕 `window.print()`；`@media print` 隱藏非證書元素、證書滿版。
- **不合格**：顯示「尚未完成」＋進度（已看完 videoDone/videoTotal 單元、已通過 quizDone/quizTotal 測驗）＋返回教室連結。
- 403（未購課）：顯示「購課後完成課程即可取得證書」。

**Middleware**：`/classroom/certificate` 加進 `CLASSROOM_LOCK_EXEMPT`（比照 account/reset-password 工具頁；預售鎖站期間仍可達，屆時多半顯示「未完成」）。

## 測試

- `lib/certificate.js`：`certificateStatus` 各邊界（全完成 eligible、缺 1 影片、缺 1 測驗、無測驗仍可合格、無影片不合格、空輸入）。
- 部署後 e2e：未登入 `/api/classroom/certificate` → 401；未完成帳號 → `eligible:false` 且進度數字正確；（若有已完成帳號）→ 合格、頁面列印正常、`certificates` 表出現一列、重打不換發。

## 部署

- 新 SQL：`certificates` 段 append 到 `supabase-classroom-features.sql`，由 controller 以 Supabase MCP 套用。
- 無新環境變數。沿用 `feat/point2-carousel`、`npx vercel --prod`。
- 全程繁中；commit 結尾 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。

## 建置任務（約 4 個）

1. `lib/certificate.js` `certificateStatus` 純函式＋測試。
2. SQL append（certificates 表＋RLS）＋ `/api/classroom/certificate` route（含 cert_code 產生器）。
3. 證書頁 `/classroom/certificate`＋帳號頁入口＋middleware 放行。
4. 部署套用 SQL＋e2e。
