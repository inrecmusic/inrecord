# 學員帳號設定 ＋ 忘記密碼流程 — 設計文件

- 日期：2026-07-10
- 分支：`feat/point2-carousel`
- 狀態：待實作

## 背景與問題

目前學員（`/classroom`）登入後**沒有任何修改個人資料的地方**：

- 教室頁首只**唯讀顯示** Email，加登出鈕；全站無 profile／account／設定頁。
- 程式碼裡沒有任何 `supabase.auth.updateUser` 呼叫。
- 留言／評分的掛名取自 `user.user_metadata.full_name || email 前綴`（見 `app/api/classroom/comment/route.js`、`app/api/classroom/rating/route.js`），學員無法設定或修改。
- 登入頁（`app/classroom/login/page.jsx`）沒有「忘記密碼」；email+密碼登入者忘記密碼時無法自助重設。

**已知現況（影響範圍）**：登入頁已有「Email 驗證碼登入（免密碼／OTP）」，忘記密碼者其實已能用 OTP 登入。本功能仍補上正規的「忘記密碼→重設」流程，讓習慣用密碼的人能重新設定密碼，而非被迫改用 OTP。

## 目標

1. 新增帳號設定頁 `/classroom/account`，讓登入學員**修改顯示名稱**。
2. 新增**忘記密碼流程**：登入頁「忘記密碼」→ 寄重設信 → 重設密碼頁設定新密碼。

## 非目標（明確排除）

- **不開放修改 Email**：Email 是課程開通（enrollments/subscriptions）的比對鍵，改動風險高，本次不做。
- **不回頭改寫既有留言／評分的掛名**：既有留言/評分的 `user_name` 是發表當下的快照，維持不變；改名只影響**之後**的發表。
- 不做頭像、個人簡介等其他 profile 欄位（YAGNI）。

---

## 架構總覽

三個前端頁面 ＋ 一支純函式（驗證）：

| 檔案 | 類型 | 職責 |
|---|---|---|
| `app/classroom/account/page.jsx` | 新增 client page | 帳號設定：改顯示名稱、Email 唯讀、連往重設密碼 |
| `app/classroom/reset-password/page.jsx` | 新增 client page | 設定新密碼表單（忘記密碼與登入後改密碼共用） |
| `app/classroom/login/page.jsx` | 修改 | 密碼模式加「忘記密碼？」→ 輸入 Email 寄重設信 |
| `app/classroom/page.jsx` | 修改 | 頁首加「帳號」入口連往 `/classroom/account` |
| `lib/account.js` | 新增純函式 | `validateDisplayName(raw)` → `{ ok, value, error }` |
| `lib/account.test.js` | 新增測試 | 顯示名稱驗證單元測試 |

認證全走既有 `@/lib/supabase` 前端 client；不新增後端 API 路由（Supabase Auth 前端 SDK 已足夠，且 RLS 不涉及）。

---

## 第 1 塊：帳號設定頁 `/classroom/account`

### 存取控制
- 只需**登入**即可進入（gate 於 `supabase.auth.getUser()`，**不**要求已購課，與教室頁不同）。
- 未登入 → 導向 `/classroom/login`。

### 顯示名稱
- 儲存位置：Supabase `user_metadata.full_name`，透過 `supabase.auth.updateUser({ data: { full_name: value } })`。
- 表單預填目前 `user.user_metadata?.full_name || ""`。
- 送出前經 `validateDisplayName`：
  - 去除頭尾空白。
  - 長度 1–20 字（去空白後）；空字串／全空白 → 錯誤「請輸入顯示名稱」。
  - 通過回 `{ ok: true, value }`；不通過回 `{ ok: false, error }`。
- 成功後顯示「已儲存」狀態，並更新頁面上顯示的名字。
- 頁面標註說明：「修改後僅影響日後的留言與評分掛名，先前發表的內容不會更動。」

### 版面
- Email（唯讀，說明「登入帳號，無法修改」）
- 顯示名稱（可編輯輸入框 ＋ 儲存鈕）
- 一行連結「要修改密碼？」→ `/classroom/reset-password`
- 返回教室連結
- 視覺沿用教室既有 inline-style 風格（教室頁本身用 inline styles，非 CSS module），保持一致。

### 教室頁首入口
- `app/classroom/page.jsx` 頁首（顯示 Email 那排）加一個「帳號」文字鈕/連結 → `/classroom/account`，樣式比照既有「登出」鈕。

---

## 第 2 塊：忘記密碼流程

### 採用方案：沿用既有 `/auth/callback`
既有 `app/auth/callback/page.jsx` 已用 PKCE `exchangeCodeForSession(code)` 並支援 `next` 參數（`safeNextPath` 擋 open redirect）。密碼重設信的連結導回 callback 即可建立「復原 session」，**不需另寫 token 解析**。

（替代方案：重設頁自行解析 URL 的 recovery token — 多一套需維護的解析邏輯，且與現有 OAuth/OTP 流程不一致，故不採用。）

### 流程
1. **登入頁**（`app/classroom/login/page.jsx`，密碼模式）新增「忘記密碼？」連結／小表單：
   - 輸入 Email → `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/auth/callback?next=/classroom/reset-password" })`
   - 成功 → 顯示「若此信箱有帳號，重設信已寄出」（不透露帳號是否存在，避免帳號枚舉）。
2. 學員點信中連結 → `/auth/callback` 換 session → 轉址 `/classroom/reset-password`。
3. **重設密碼頁** `/classroom/reset-password`：
   - 進頁先確認有 session（`getSession`）；無 session → 顯示「連結已失效或過期，請重新申請」＋ 回登入頁連結。
   - 有 session → 顯示「設定新密碼」表單（新密碼 ＋ 再次輸入）。
   - 驗證：兩次一致、長度 ≥ 6（比照 Supabase 預設）。
   - `supabase.auth.updateUser({ password })` → 成功 → 顯示成功 ＋ 導向 `/classroom`。
4. 因為此頁只要「有 session」即可運作，**同時作為登入後的「修改密碼」頁**（帳號設定頁的「要修改密碼？」連結即指向它）。

### 需在 Supabase 後台設定（部署清單，使用者操作）
- Auth → URL Configuration → Redirect URLs 加入：
  - `https://inrecordmusic.com/auth/callback`（若尚未涵蓋）
  - `https://inrecordmusic.com/classroom/reset-password`
- Auth → Email Templates →「Reset Password」模板確認啟用（Supabase 內建；中文化可選）。

---

## 錯誤處理

- 帳號頁 / 重設頁在 `supabase` 未配置時顯示「系統設定錯誤，請聯繫管理員」（比照登入頁）。
- `updateUser` 失敗 → 顯示 Supabase 回傳訊息（密碼太短等）。
- 忘記密碼寄信：無論帳號是否存在都回相同成功訊息（防帳號枚舉）。
- 重設頁無 session → 明確導引重新申請，不讓表單卡死。

---

## 測試

- `lib/account.test.js`：`validateDisplayName` 的邊界（空白、純空格、超長、剛好 20 字、去頭尾空白、中英數混合）。
- 手動 / preview 驗證：
  - 改名 → 存 → 重新整理仍在 → 發一則新留言確認掛名為新名字、舊留言不變。
  - 忘記密碼 → 收信 → 點連結 → 設新密碼 → 用新密碼登入成功。
  - 重設頁無 session 直接開 → 顯示失效導引。
- 部署 Vercel preview 真機驗證，通過後再上正式站。

---

## 部署注意

- 沿用 `feat/point2-carousel`（現行正式站部署分支）。
- 前端變更為主，**無 DB migration、無新後端路由**。
- 唯一環境面待辦為上述 Supabase 後台 Redirect URLs ＋ Reset Password 模板（使用者操作）。
- 依 `project_inrecord_deploy` / `project_inrecord_github` 慣例：push 前 `gh auth switch --user inrecmusic`、部署 `npx vercel --prod`（Vercel 未接 GitHub 自動部署）。
