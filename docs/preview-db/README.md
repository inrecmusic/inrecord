# Preview 專用資料庫（與正式站隔離）

Vercel 的 preview 部署原本和正式站共用同一個 Supabase，在 preview 做任何「寫入」（發公告、建券、手動開通）
都會直接進正式資料。這份文件把 preview 指到一個獨立的 Supabase 專案。金鑰全程只在 Supabase／Vercel 後台之間搬，
不經過對話或 repo。

## 一、建 Supabase 專案（約 3 分鐘）

1. https://supabase.com/dashboard → **New project**
   - Name：`inrecord-preview`
   - Region：**Northeast Asia (Tokyo)**（與正式站、Vercel hnd1 同區）
   - 資料庫密碼：隨便產一組、存密碼管理器（之後幾乎用不到）
2. 專案建好後 → **Project Settings → API** 記下三個值（等下貼到 Vercel）：
   - Project URL
   - `anon` public key
   - `service_role` secret key

> 費用：Pro 方案的 US$10 運算額度只夠第一個專案，第二個專案約 **US$10／月**。
> 不想多這筆就在「免費方案的另一個 org」下建（免費專案 7 天沒活動會暫停，用之前到後台按 Restore）。

## 二、建表（貼一次 SQL）

1. 新專案 → **SQL Editor → New query**
2. 在本機產一份合併好的 SQL（依 CLAUDE.md 的部署順序）：
   ```bash
   cd ~/code/inrecord && bash docs/preview-db/build-schema.sh   # 產出 /tmp/inrecord-preview-schema.sql
   ```
   把檔案內容整份貼上 → **Run**。全部 idempotent，出現 `already exists` 之類的 NOTICE 可忽略；**ERROR** 才要看。
3. 再開一個 query，貼 `docs/preview-db/seed.sql` → **Run**（種假資料：教室開放、一門課、測試學員、一則公告）。

## 三、Storage buckets（後台手動建，SQL 不會建）

**Storage → New bucket**：
| 名稱 | Public |
|---|---|
| `proof-uploads` | ✅ public（粉絲憑證圖） |
| `course-materials` | ❌ private（講義 PDF） |
| `homework` | ❌ private（作業上傳） |

## 四、Auth 設定

**Authentication → URL Configuration**
- Site URL：`https://inrecord-preview-inrec.vercel.app`
- Redirect URLs 加：`https://inrecord-preview-inrec.vercel.app/**`

登入方式：Email 驗證碼（Supabase 內建信件，免設定；有頻率上限，測試夠用）。
Google 登入要另外到 **Authentication → Providers → Google** 貼 Client ID／Secret（可沿用正式站那組，
並到 Google Cloud 的 OAuth 用戶端把新專案的 callback URL 加進去）；不急可先不設。

## 五、Vercel 把 Preview 的 Supabase 指過去

https://vercel.com/inrecmusic-9815s-projects/inrecord/settings/environment-variables

對這三個變數各做一次：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`
1. 找到現有那筆（Environments 是 Production, Preview）→ **Edit** → 把 **Preview 取消勾選**，只留 Production → Save
2. **Add New** → 同名 → 值貼新專案的 → Environments **只勾 Preview** → Save

改完後重新部署一次 preview（`npx vercel` 或請 Claude 重部署）才會生效。

## 六、驗證

- preview 後台 → 公告：應該只看到「這是 preview 環境」那則（正式站的公告不在這裡）
- preview 教室用 `changaa68332@gmail.com` Email 驗證碼登入 → 看得到 Ch1 兩個單元與公告
- 正式站不受任何影響（三個變數的 Production 值沒動）

## 之後要注意

- 正式站有新的 SQL 檔時，preview 也要跑一次（或重新產合併檔整份貼，idempotent 沒關係）。
- preview 的資料是假的，**不要**拿 preview 的訂單數／學員數當真。
