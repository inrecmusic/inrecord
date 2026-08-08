# 學員資料頁（Student Profile）設計

- 日期：2026-08-08
- 狀態：設計已核可，待寫實作計畫
- 相關現況：`app/classroom/account/page.jsx`（現只改 full_name via `updateUser`）、`app/classroom/login/page.jsx`（OTP/Google/密碼登入）、`app/classroom/page.jsx`（教室進入 gate）、`lib/classroom-auth.js`（`requireClassroomAuth`）、`app/privacy/page.jsx`、後台 `app/admin/page.jsx`（學員管理 `/api/admin/students`、顧客查詢 `CustomerPage`）

## 背景與目標
學員資訊目前**很零散**：無任何 profile 表（只有 `course_preview_leads` 體驗名單）；Google 登入者 auth metadata 有名字/頭像，Email OTP 登入者幾乎空白（只有 email）；購買時填的姓名/電話躺在 `orders`、與登入帳號沒串起來。要一個**集中的學員資料**，同時服務四個目的：① 了解學員、因材施教/客服 ② 帳號安全/找回 ③ 行銷/回購 ④ 營運統計/學員輪廓。

## 需求（定案）
- **欄位**：核心 3（真實姓名、手機、鋼琴程度）＋ 選配 5（學習目標、怎麼認識我們、練習器材、年齡層、性別）。**不收** email（＝登入帳號、已有）與高敏感個資（身分證/生日）。
- **填寫時機**：首次進教室引導「完善資料」，**核心必填、選配可跳過**；帳號頁隨時補改；**預填訂單已有的姓名/手機**降低摩擦。
- **隱私**：表單告知聲明＋連隱私政策，隱私政策頁補新欄位條文，存 `consent_at`；**不**強制勾選同意框。
- **後台**：核心＝單一學員檢視＋名單一覽/篩選；加值＝統計圖表＋匯出 CSV。

## 設計

### A. 資料模型 —— 新表 `student_profiles`
用結構化表（非 auth metadata），因為後台名單/統計/篩選/匯出只有 SQL 表做得到。放新 idempotent `.sql`、service_role RLS（比照其他功能表）。

```sql
CREATE TABLE IF NOT EXISTS student_profiles (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,                 -- 冗餘存，方便 join orders/enrollments
  real_name  TEXT,                          -- 核心
  phone      TEXT,                          -- 核心
  level      TEXT,                          -- 核心 'none'|'little'|'some'（沒碰過/摸過一點/有基礎）
  goal       TEXT,                          -- 選配（自由文字，限長）
  source     TEXT,                          -- 選配 'ig'|'friend'|'concert'|'search'|'other'
  equipment  TEXT,                          -- 選配 'acoustic'|'digital'|'none'
  age_group  TEXT,                          -- 選配 'under18'|'18_29'|'30_44'|'45_59'|'60plus'
  gender     TEXT,                          -- 選配 'male'|'female'|'other'|'prefer_not'
  consent_at TIMESTAMPTZ,                   -- 同意時間戳（首次送出時寫）
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_student_profiles" ON student_profiles
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
```
一人一列（`user_id` PK）。所有讀寫走後端 service-role client。

### B. 前台 —— 兩個入口
1. **首次引導**（`app/classroom/page.jsx` 進入流程）：登入（`getUser`）→ 有課程存取（`verify-purchase`）→ 查 profile；**核心 3 欄未齊 → 顯示「完善資料」步驟**（核心必填、選配可跳過），填完/跳過（選配）才進課程內容。核心未填不放行課程（但選配跳過可放行）。
   - **預填**：以該 email 最近一筆 `paid` 訂單的 `buyer_name`/`phone` 預填姓名、手機（學員確認即可）。
2. **帳號頁 `/classroom/account`**：新增「我的學員資料」區塊，可讀寫全部 8 欄。

**學員端 API**（`requireClassroomAuth`，只碰自己的）：
- `GET /api/classroom/profile` → 回自己的 profile（＋預填候選：訂單 buyer_name/phone）。
- `POST /api/classroom/profile` → upsert 自己的 profile（純函式驗證＋首次寫 `consent_at`）。`user_id`/`email` 一律取自驗證後 JWT，不信任前端傳入。

### C. 隱私（合規基本盤）
- 「完善資料」表單與帳號頁資料區底部：一行告知「填寫即同意依隱私政策，用於課程服務與聯繫」＋ 連 `/privacy`。
- `app/privacy/page.jsx` 補「學員資料之蒐集」條文：蒐集欄位、目的（授課/客服/帳號協助/統計）、利用範圍、保存與刪除。
- 首次送出寫 `consent_at`。
- ⚠️ 非法律意見；上線前建議自行確認個資法遵。

### D. 後台（`app/admin/page.jsx`）
**核心（第一階段）**
- **單一檢視**：顧客查詢 `CustomerPage` / 學員管理 detail 顯示該學員 profile（`/api/admin/students` 或新端點帶回 profile）。
- **名單一覽＋篩選**：學員管理表格加 profile 欄位（姓名/手機/程度/來源/是否已填），可依程度/來源/已填篩選排序。

**加值（第二階段，同 spec、實作分開 task）**
- **統計圖表**：`GET /api/admin/profile-stats`（後端 SQL `group by` level/source/age_group/gender）→ 分布圖（沿用站上既有圖表元件）。
- **匯出 CSV**：學員 profile CSV（**沿用既有 CSV 慣例：BOM ＋ 公式注入防護**，見 `lib/serial-codes.js`/對帳匯出）。

### E. 測試
- 純函式 `lib/student-profile.js`：`validateProfile`（核心必填、手機格式、選配 enum 白名單、goal 限長）、`mergePrefill`（訂單姓名/手機預填合併）、`profileComplete`（核心是否齊、判是否要跳首次引導）。
- 學員 API 授權閘：未登入 401、只能讀寫自己的（不能靠傳 user_id 改別人）。
- 後台端點 `verifyAdminToken` 把關。

## 不做（YAGNI）
- 不收身分證/生日等高敏感個資；不做手機 OTP 驗證（只格式驗證）。
- 不強制勾選同意框（用告知聲明＋隱私政策）。
- profile 為私人，不對其他學員可見。
- 統計圖表/CSV 屬加值，可於核心上線後再做。

## 風險與注意
- **隱私合規**：告知聲明＋隱私政策＋`consent_at` 是基本盤，非法律意見——上線前確認個資法遵（尤其手機）。
- **首次引導摩擦**：核心必填在開課尖峰可能造成部分流失；靠「選配可跳＋預填訂單資料」降低。
- **預填一致性**：預填靠 email 對應訂單；若學員登入 email ≠ 購買 email（如用不同 Google），預填會落空（此時空白讓他自填即可，不阻擋）。
- **與 auth metadata 並存**：現有 `full_name`（account 頁）仍在 auth metadata；本功能的 `real_name` 存 profiles 表。可在帳號頁把兩者整合顯示，避免混淆（實作時處理）。
