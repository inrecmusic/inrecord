# InRecord 手動驗收清單（B2 / C4 / D2）

> 自動化（curl/API）已驗過的部分不在此清單；這裡只列「需真人操作（OAuth／刷卡／後台密碼）」的項目。
>
> **通用**：測試前開**無痕視窗**（乾淨 cookie）。出錯時除截圖外，請打開 **DevTools → Console + Network**，截下紅字／失敗請求——這對追根因最有用。
>
> **出錯時給工程師的「最有用三件套」**
> 1. 📸 畫面截圖（看得到網址列）
> 2. 🔴 Console 紅字（DevTools → Console）
> 3. 🌐 失敗的 Network 請求（點開看 Status + Response）

---

## 🔑 B2 — 登入測試

**前置**：因預售鎖站（`NEXT_PUBLIC_PRESALE_MODE=1`），登入後要進教室需先解鎖。
解鎖方式：帶 `?preview=<PRESALE_BYPASS_TOKEN>` 進 `/classroom`，middleware 驗證後會種 7 天 cookie（`inrec_preview`）並導到乾淨網址。
Token 值在 Vercel → Settings → Environment Variables（Production，加密），或 `npx vercel env pull` 取。

| # | 步驟 | ✅ 應該看到 | 📸 出錯截這個 |
|---|---|---|---|
| B2-1 | 開 `inrecordmusic.com/classroom/login` | 登入頁：Google 登入鈕 + email/密碼欄 | 整頁 + Console |
| B2-2 | 點 Google 登入 → 選帳號 | Google 同意畫面（App 名 InRecord）→ 授權後回站 | Google 那一頁 + 回站後網址列 |
| B2-3 | 回站後狀態 | 已登入（右上顯示帳號/登出，或自動進流程） | 回站畫面 + Network `/auth` 有無 4xx/5xx |
| B2-4 | 解鎖教室：開 `inrecordmusic.com/classroom?preview=<TOKEN>` | 網址列 `?preview=` 自動消失（種 cookie 後導乾淨網址），**不被導回首頁** | 仍被導回 `/` → 截網址列（多半 token 打錯） |
| B2-5 | 直接再開 `inrecordmusic.com/classroom` | cookie 已種，能進教室（課程目錄／播放器） | 整頁 + Console |
| B2-6 | email 註冊/登入（另測一次） | email+密碼能登入；忘記密碼流程有寄信 | 登入失敗錯誤訊息 + Network |

> ⚠️ 已知限制：Google「選擇帳戶」頁仍顯示 `supabase.co`——Supabase 限制、已決定維持現狀，**不算 bug**。

---

## 💳 C4 — 結帳測試（PAYUNi sandbox）

**前置**：先完成 B2 登入（未登入點購買會被導去 login）。
正式站目前接 **PAYUNi 測試金流（測試商店 S044418824）**，用 **PAYUNi sandbox 測試卡**（卡號在 PAYUNi 測試後台/文件，**別用真卡**）。
建議登入 email 用 `sandbox-xxx@...` 方便事後清理。

| # | 步驟 | ✅ 應該看到 | 📸 出錯截這個 |
|---|---|---|---|
| C4-1 | 首頁捲到方案 → 點「學琴全攻略 NT$3,999」購買 | BuyModal：方案名、價格 3,999、email 已帶入 | Modal + Console |
| C4-2 | （選配）輸入優惠碼 | 顯示折後價；無效碼顯示錯誤 | Modal 折扣顯示處 |
| C4-3 | 點付款 | 轉到 PAYUNi 付款頁（sandbox） | 卡住 → 截 Network `/api/payuni/checkout` 回應 |
| C4-4 | 輸入 sandbox 測試卡付款 | PAYUNi 顯示成功、導回網站成功頁 | PAYUNi 錯誤頁 + 回站網址 |
| C4-5 | 回站後開通驗證 | 同帳號進教室（記得 `?preview=` 解鎖）→ 課程**已開通可看**；bundle 的 AI 遊戲也可用 | 教室顯示「未購買/未開通」→ 截畫面 |
| C4-6 | 發票 | 收到 Amego 電子發票（或後台該筆訂單有發票號碼） | — |
| C4-7 | 開課信 | 收到 Brevo 開課確認信（寄件人 noreply@inrecordmusic.com） | 沒收到 → 查垃圾信，仍無記下時間點 |

> 測完通知工程師給**清理 SQL**，把該筆 `sandbox-*` 的 order/enrollment/subscription 清掉。

---

## 🛠 D2 — 後台測試

**前置**：帳號 `inrecmusic@gmail.com` + 2026-06-14 輪替後的強密碼。
`/api/admin/login` 有「5 次失敗鎖 15 分」，**別亂試密碼**。

| # | 步驟 | ✅ 應該看到 | 📸 出錯截這個 |
|---|---|---|---|
| D2-1 | 開 `inrecordmusic.com/admin` | 後台登入畫面 | 整頁 + Console |
| D2-2 | 輸入帳密登入 | 進後台儀表板 | 登入失敗錯誤 + Network `/api/admin/login` 回應 |
| D2-3 | 訂單管理 | 訂單列表載入；頂部「待處理告警」「對帳彙整」面板正常 | 列表空白/轉圈 → 截 Network |
| D2-4 | 對帳彙整 | 設日期區間 → 顯示有效收款/退款/付款方式分佈；可匯出 CSV | 數字異常截整塊 |
| D2-5 | 課程管理 → 管理教室 | 章節/單元/AI 遊戲可看可編輯 | — |
| D2-6 | 優惠券 + 序號庫 | 優惠券列表、序號庫可產碼/下載 CSV | — |
| D2-7 | （選配）退款 | 對 C4 那筆 sandbox 訂單試退款 → 狀態轉 refunded、教室存取撤銷 | 退款失敗錯誤訊息 |

---

## 驗收結論記錄

- [ ] B2 登入：通過 / 有問題（描述：____）
- [ ] C4 結帳：通過 / 有問題（描述：____）
- [ ] D2 後台：通過 / 有問題（描述：____）

> 自動化驗證（官網頁面、API 把關、RLS anon 阻擋、價格、checkout 守衛）已於 2026-06 全數通過。
