# 教室七大功能 設計文件（總設計）

- 日期：2026-07-10
- 分支：`feat/point2-carousel`
- 狀態：待審查
- 產出結構：**本文件為總設計**（共用地基＋七功能各一節）。之後**每個功能各出一份實作計畫**（`docs/superpowers/plans/`），照 P1→P2→P3 分階段用 subagent 逐一執行、逐一上線。

## 背景

InRecord 教室（`/classroom`）目前有：影片（Bunny 簽名 iframe＋Vimeo legacy）、進度追蹤、留言、評分、作業上傳、互動遊戲、帳號設定（2026-07-10 新增）。相較一般線上課程平台，缺七項標配。本設計一次規劃，分階段實作。

## 使用者已拍板的四個跨功能決策

1. **字幕**：Bunny 原生字幕（後台上傳 VTT/SRT → 伺服器呼叫 Bunny API 掛上 → 播放器自動顯示 CC）。需新增 `BUNNY_API_KEY`。Vimeo legacy 不含字幕。
2. **完課證書**：需「看完全部單元 **＋** 通過所有章節測驗」才發放 → **證書依賴測驗**（P2 先於 P3）。
3. **測驗**：計分＋及格門檻（單選選擇題；伺服器端計分；記錄分數；可重考）。
4. **學員自助中心發票**：只顯示資訊（訂單/金額/狀態/發票號碼），不重出 PDF。

## 共用地基（七功能一致沿用既有慣例，降低風險）

- **學員端 API 驗證**：沿用既有 inline `getUserClient(token)`（`createClient` 帶 `Authorization: Bearer <jwt>`）→ `.auth.getUser()` 取身分；購課驗證用 `hasCourseAccess(getSupabaseAdmin(), user.email)`（`lib/course-access.js`，`course_id='piano-101'`）。特權讀寫用 `getSupabaseAdmin()`（service role）。
- **後台 API 驗證**：`verifyAdminToken(req)`（`lib/adminAuth.js`）→ `payload.email` 當 actor；沿用 `logAudit`（`lib/audit.js`）記錄變更。
- **後台 UI**：全站型功能加 `NAV_GROUPS` 條目＋`{page==='x' && <XPage/>}`；課程內功能加 `COURSE_TABS` 條目（`CourseDetailPage`）。子頁 `app/admin/*.jsx`，用 `admin.module.css`，token 取自 `sessionStorage.inrecord_admin_token`。
- **教室 UI**：inline style（無 CSS module）；新分頁加進 `tab` 陣列＋對應 `{tab==='x' && <XTab/>}`；資料靠 props（`token`/`currentVideo`/`chapters`/`videos`/`progress`）。
- **資料表**：每張新表 `ENABLE ROW LEVEL SECURITY` ＋ `service_role` policy（`USING/WITH CHECK auth.role()='service_role'`）；學員私有資料另加 `authenticated` 且 `auth.uid()=user_id` 的 policy。更新時間用既有 `update_updated_at()` trigger。新增 SQL 一律寫進**新檔** `supabase-classroom-features.sql`（idempotent），並在 `supabase-hardening.sql` 精神下鎖好。
- **Storage**：沿用 `proof-uploads` 模式——**伺服器端**上傳（service role，`FormData`→Route Handler）、私有 bucket、下載走**簽名 URL**（5 分鐘 TTL）。講義用新私有 bucket `course-materials`。
- **測試**：純邏輯抽到 `lib/*.js`＋`lib/*.test.js`（vitest node 環境，繁中敘述）；頁面元件不強制測試，靠純函式測＋preview 真機驗。

## 建置順序（每階段各自可獨立上線）

| 階段 | 功能 | 依賴 |
|---|---|---|
| **P1** | ①講義 PDF、⑦公告、④筆記/書籤 | 無（純 CRUD） |
| **P2** | ⑤自助中心、⑥測驗 | 無（測驗為 P3 前置） |
| **P3** | ⑥→③完課證書、②字幕 | 證書依賴測驗（P2）；字幕依賴 `BUNNY_API_KEY` |

---

## ① 講義／樂譜 PDF 下載（P1）

**表** `materials`：`id UUID PK, video_id UUID NULL REFERENCES videos(id) ON DELETE CASCADE, title TEXT NOT NULL, storage_path TEXT NOT NULL, file_size INT, sort_order INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW()`。`video_id` 為 NULL＝全課程通用講義；非 NULL＝掛在該單元。RLS service_role only（下載一律經後端簽名，前端不直讀）。

**Storage**：新私有 bucket `course-materials`，路徑 `materials/{uuid}.{ext}`（CSPRNG 檔名）。僅接受 PDF（`lib/material-file.js` 驗 magic bytes `%PDF`＋副檔名＋大小上限，例 20MB；有測試）。

**後台**：`ChaptersUnitsPage` 單元編輯區加「講義」子區（該單元的 materials 增刪）＋課程層級「通用講義」區。API `/api/admin/materials`：POST（multipart→上傳 Storage→insert）、GET（列表）、DELETE（刪 row＋Storage 物件）。`verifyAdminToken` 守門。

**學員**：`/api/classroom/materials?video_id=`（可省略取全課程通用）→ `hasCourseAccess` 驗證 → 回該單元＋通用講義清單，每筆附**簽名下載 URL**（5min）。教室 UI：影片資訊區下方「講義下載」區塊，列出檔名＋下載鈕。未購課 403。

**測試**：`lib/material-file.js`（PDF 驗證邊界）。

---

## ⑦ 公告（P1）

**表** `announcements`：`id UUID PK, title TEXT NOT NULL, body TEXT NOT NULL, pinned BOOLEAN DEFAULT FALSE, published BOOLEAN DEFAULT FALSE, created_at, updated_at`（`update_updated_at` trigger）。RLS service_role only（學員讀走後端過濾 published）。

**後台**：新 `NAV_GROUPS` 條目「公告管理」＋子頁 `app/admin/AnnouncementsPage.jsx`。API `/api/admin/announcements` CRUD（`verifyAdminToken`＋`logAudit`）。可設 published／pinned。

**學員**：`/api/classroom/announcements` → `hasCourseAccess` → 回 `published=true` 清單（pinned 置頂，其餘依 created_at desc）。教室 UI：最新一則置頂公告顯示為教室頂部**可關閉橫幅**（關閉狀態存 localStorage，以公告 id 記憶，不重複煩）；完整清單放一個「公告」區塊/彈窗。**MVP 不做每則已讀狀態**。

**測試**：`lib/announcements-view.js`（排序＋pinned 置頂＋只留 published 的純函式）。

---

## ④ 筆記／書籤（P1）

**表** `notes`：`id UUID PK, user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, video_id UUID REFERENCES videos(id) ON DELETE CASCADE, seconds INT NOT NULL DEFAULT 0, body TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()`。RLS：service_role ＋ `authenticated` 且 `auth.uid()=user_id`（僅本人可讀寫己筆記，比照 comments 的 `auth.uid()=user_id` 模式）。

**學員**：`/api/classroom/notes`：GET（`?video_id=` 回該片本人筆記；不帶則回全部，供「我的筆記」總覽）、POST（`{video_id, seconds, body}` 建立，以 authenticated client 直插靠 RLS）、DELETE（`?id=` 刪本人筆記）。`hasCourseAccess` 驗證。教室 UI：新「筆記」分頁；「＋ 在此刻加筆記」抓當前播放秒數（Bunny 走 player.js `getCurrentTime`、Vimeo 走 `@vimeo/player`，教室已有這兩個 player 實例的取用點）；筆記清單依 seconds 排序，點某則 **跳轉播放器到該秒數**（player.js `setCurrentTime` / Vimeo `setCurrentTime`）。**無後台**。

**測試**：`lib/notes-format.js`（秒數→`mm:ss` 顯示、依 seconds 排序的純函式）。

---

## ⑤ 學員自助中心（P2，只顯示資訊）

**無新表**。`/api/classroom/my-orders`：`getUserClient` 取身分 → 以 `user.email` 用 service role 查 `orders`（**只回本人 email 的單**）→ 回**淨化後**欄位：`mer_trade_no, plan_label, amount, currency, status, invoice_no, source, created_at`（不回其他人資料、不回 payuni 內部欄位）。

**學員 UI**：在既有帳號設定頁 `/classroom/account` 增「我的訂單」區塊（該頁已於預售 middleware 放行、免另加豁免）。每筆顯示：方案、金額、狀態（付款成功/待付款/已退款）、發票號碼（有則顯示「發票號碼 XXX，已寄至你的信箱」；無則「—」）、日期。純唯讀，不重出 PDF。

**測試**：`lib/my-orders-view.js`（狀態中文化、發票文案、排序純函式）。

---

## ⑥ 測驗／評量（P2，計分＋門檻）

**表**：
- `quizzes`：`id UUID PK, chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE, title TEXT NOT NULL, pass_score INT NOT NULL DEFAULT 80, published BOOLEAN DEFAULT FALSE, sort_order INT DEFAULT 0, created_at, updated_at`（每章節可有測驗）。
- `quiz_questions`：`id UUID PK, quiz_id UUID REFERENCES quizzes(id) ON DELETE CASCADE, question TEXT NOT NULL, options JSONB NOT NULL, correct_index INT NOT NULL, sort_order INT DEFAULT 0`（`options`＝字串陣列；單選）。
- `quiz_attempts`：`id UUID PK, user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, quiz_id UUID REFERENCES quizzes(id) ON DELETE CASCADE, score INT NOT NULL, passed BOOLEAN NOT NULL, answers JSONB, created_at`。
- 三表 RLS service_role only；attempts 另加 authenticated 讀本人。

**後台**：新 `COURSE_TABS` 條目「測驗管理」＋子頁 `app/admin/QuizzesPage.jsx`：選章節→建測驗（標題、及格分、published）→編題（題目、選項、正解、排序）。API `/api/admin/quizzes`、`/api/admin/quiz-questions` CRUD（`verifyAdminToken`＋`logAudit`）。

**學員**：
- `/api/classroom/quizzes`（`hasCourseAccess`）→ 回 published 測驗清單（可含本人最佳成績/是否通過）。
- `/api/classroom/quiz?id=`：回題目與選項，**絕不回 `correct_index`**（防作弊）。
- `/api/classroom/quiz-attempt`（POST `{quiz_id, answers:[選項index...]}`）：伺服器讀正解 → `gradeQuiz` 計分 → 寫 `quiz_attempts` → 回 `{score, passed, correct:[每題正解]}`（作答後才回正解供檢討）。**計分一律伺服器端**。可重考（多筆 attempt，取最佳）。
- 教室 UI：章節/單元旁「測驗」入口或新分頁；作答→送出→顯示分數、通過與否、逐題對錯與解說；可重考。

**測試**：`lib/quiz.js`：`gradeQuiz(questions, answers, passScore) → {score, passed, correct}`（純函式，含全對/全錯/部分對/題數不符邊界）＋`stripAnswers(questions)`（移除 correct_index 供前端）。

---

## ③ 完課證書（P3，依賴完課＋測驗）

**資格**：`enrollments` 有該生 ＋ 全部 published 影片 `progress.completed` ＋ 全部 published 測驗 `passed`。純函式 `lib/certificate.js`：`isCertificateEligible({ videos, quizzes, progress, attempts }) → { eligible, missingVideos, missingQuizzes }`（有測試）。

**表** `certificates`（用於留存＋驗證）：`id UUID PK, user_id UUID, email TEXT, cert_code TEXT UNIQUE, issued_at TIMESTAMPTZ DEFAULT NOW()`。`cert_code` 為可公開的驗證碼（CSPRNG）。RLS service_role only。

**API** `/api/classroom/certificate`：`getUserClient` 取身分 → 後端重算資格（不信任前端）→ 若合格則 upsert `certificates`（冪等，一人一張）→ 回 `{ eligible, name, courseTitle, issuedAt, certCode }`（name 取 `user_metadata.full_name`，即帳號設定可改的那個；缺則 email 前綴）。不合格回 `{ eligible:false, missing... }`。

**學員 UI**：新頁 `/classroom/certificate`（或帳號頁入口）：合格→渲染 **HTML 證書**（姓名、課程名、發證日、驗證碼），Apple 簡約風，「列印／存成 PDF」用 `window.print()`（不裝重的 PDF 套件）；不合格→顯示還差哪些單元/測驗。**不需 middleware 豁免**（證書只在課程開通後才有意義，屆時教室已解鎖）。

**測試**：`lib/certificate.js`（資格判定各種缺項邊界）。

---

## ② 字幕（P3，Bunny 原生）

**需求**：新增環境變數 `BUNNY_API_KEY`（Bunny Stream 該 Library 的 AccessKey；與既有 `BUNNY_TOKEN_KEY` 不同、與 `NEXT_PUBLIC_BUNNY_LIBRARY_ID` 併用）。

**後台**：`ChaptersUnitsPage` 影片編輯區加「字幕」子區：對有 `bunny_video_id` 的影片上傳 VTT/SRT（選語言，預設 `zh`）。API `/api/admin/video-captions`：POST（multipart，讀檔內容→呼叫 Bunny `POST /library/{lib}/videos/{videoId}/captions/{srclang}`，body 帶 `label`＋base64 字幕內容）、GET（列該片字幕）、DELETE（`DELETE .../captions/{srclang}`）。`verifyAdminToken` 守門。

**純函式** `lib/bunny-captions.js`：`buildCaptionRequest({ libraryId, videoId, srclang, label, apiKey, captionsText }) → { url, method, headers, body }`（組 Bunny API 請求，可單元測試不打網路）＋`parseSrtToVtt(text)`（若上傳 SRT 則轉 VTT，純字串轉換，有測試）。實際 `fetch` 在 route，薄薄一層。

**學員**：**零改動**——Bunny 播放器偵測到已掛字幕會自動顯示 CC 鈕。Vimeo legacy 影片不涵蓋（於後台標示）。

**測試**：`lib/bunny-captions.js`（請求組裝、SRT→VTT 轉換邊界）。

---

## 部署與環境（彙整）

- 新 SQL：`supabase-classroom-features.sql`（materials/announcements/notes/quizzes/quiz_questions/quiz_attempts/certificates 建表＋RLS＋policy，idempotent），依功能分段、可分階段跑；跑完比照 hardening 確認無 `{public}` 讀 policy。
- 新 Storage bucket：`course-materials`（私有）。
- 新環境變數：`BUNNY_API_KEY`（僅字幕功能需要，P3 才需設）。
- 每階段完成即 `gh auth switch --user inrecmusic` → push → `npx vercel --prod`（Vercel 未接 GitHub 自動部署），preview/正式站真機驗。
- 全程繁中文案；commit 結尾 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。

## 明確非目標（YAGNI）

- 不做多課程（沿用單課 `piano-101`；未來遷移見 `docs/multi-course-migration.md`）。
- 公告不做每則已讀追蹤；測驗只做單選題（不做複選/簡答/填空）；證書不做伺服器端 PDF 生成（用列印）；自助中心不重出發票 PDF；字幕不涵蓋 Vimeo legacy。
- 筆記不做分享/匯出；講義只收 PDF（不收影音/壓縮檔）。
