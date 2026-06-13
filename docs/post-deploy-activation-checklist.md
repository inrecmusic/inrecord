# 上線後啟用設定清單（👤 人工）

> 對象：2026-06-13 部署的三項功能（影片防下載、失敗告警、對帳報表）。
> 程式皆**向後相容**：未做下列設定也不會壞，但新防護／告警不會生效。對帳報表已即時生效（無需設定）。
> 圖例：🔴 強烈建議盡快　🟠 建議　✅ 完成打勾

---

## 1. 🔴 Supabase 補欄位（失敗告警落地）

未做的影響：開課信寄送失敗不會記錄、後台「待處理告警」看不到寄信失敗（付款／開通／開票不受影響）。

- [ ] 登入 Supabase → 選正式專案 → 左側 **SQL Editor**
- [ ] 開新查詢，貼上並執行專案內 `supabase-deploy.sql` 全文（idempotent，可重複執行、不會重複建欄位）
- [ ] 驗證：執行
  ```sql
  select column_name from information_schema.columns
  where table_name='orders' and column_name='email_error';
  ```
  應回傳一列 `email_error`

> 只想補這一欄也可單獨跑：
> ```sql
> ALTER TABLE orders ADD COLUMN IF NOT EXISTS email_error TEXT;
> ```

---

## 2. 🔴 Bunny Stream 影片防盜（Token + Referer）

未做的影響：影片照常播放，但 embed URL 仍是公開、可被複製外流／盜連（即未受保護）。

### 2-1 取得 Token 金鑰並開啟驗證
- [ ] 登入 Bunny.net → **Stream** → 選用的 Video Library
- [ ] 進 **Security**（或 Settings → Security）
- [ ] 開啟 **Token Authentication**
- [ ] 複製該頁的 **Token Authentication Key**（這是金鑰，勿外流、勿放前端）

### 2-2 設定允許網域（防盜連）
- [ ] 同頁 **Allowed Referrers**（允許嵌入的網域）新增：`inrecordmusic.com`
- [ ] 若本機要開發測試，另加 `localhost`（或開發時暫不靠 referer，僅靠 token）

### 2-3 Vercel 加環境變數
- [ ] Vercel → 專案 `inrecord`（帳號 inrecmusic-9815）→ **Settings → Environment Variables**
- [ ] 新增（**Production** 環境）：
  - Name：`BUNNY_TOKEN_KEY`
  - Value：上面複製的 Token Authentication Key
  - ⚠️ **不要**用 `NEXT_PUBLIC_` 前綴（這是伺服器機密）
- [ ] 重新部署讓 env 生效：`npx vercel --prod`（或 Vercel 後台 Redeploy）

### 2-4 驗證
- [ ] 進教室播一支 Bunny 影片 → 能正常播放
- [ ] 開瀏覽器開發者工具看 iframe src → 應帶 `?token=...&expires=...`
- [ ] 把舊的公開 embed 連結（無 token）貼到瀏覽器 → 應顯示 **403 Forbidden**

---

## 3. 🟠 確認告警信收發 env（Vercel Production）

未做的影響：開票／寄信失敗時，告警 email 不會寄出（後台面板仍會顯示）。

- [ ] Vercel → 專案 → Settings → Environment Variables，確認 Production 已有：
  - [ ] `ADMIN_EMAIL`（**告警信收件人**，建議用你常看的信箱）
  - [ ] `BREVO_API_KEY`
  - [ ] `BREVO_SENDER_EMAIL`（寄件人，需為 Brevo 已驗證的寄件網域/地址）
  - [ ] `BREVO_SENDER_NAME`（可選，預設 `InRecord`）
- [ ] 若有新增/修改 → `npx vercel --prod` 重新部署
- [ ] 驗證（擇一）：
  - 後台「訂單管理 → 待處理告警」面板對某筆失敗訂單按「補寄開課信」，確認流程可走
  - 或等下一筆真實失敗時，確認 `ADMIN_EMAIL` 收到主旨為 `[InRecord] …失敗 — 訂單 …` 的信

---

## 4. （參考）部署與帳號備忘
- 部署指令：`npx vercel --prod`（本專案 Vercel **未連動 GitHub** 自動部署）
- 部署前先 `npx vercel whoami` 確認帳號為 **inrecmusic-9815**（錯帳號會 Could not retrieve Project Settings）
- 正式網域：https://inrecordmusic.com

---

## 完成後
三項都打勾後，新功能即全部生效：影片受 token 保護、失敗會主動告警、寄信狀態可在後台補救。對帳報表（依日期區間彙整 + 對帳 CSV）部署當下已生效，無需額外設定。
