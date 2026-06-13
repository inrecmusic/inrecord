# InRecord 正式上線 Checklist

> 目標：六月底前正式上線。今天 2026-06-08，約 3 週。
> 圖例：👤 需你操作（憑證/外部後台）　🤖 程式可協助　⏳ 有外部審核時程
> 📋 端對端手動測試逐步腳本見 [`test-script.md`](./test-script.md)（金流／退款／發票／教室存取／優惠券去重）。

---

## 🔴 P0 — 上線阻斷項（未完成無法正式收款）

### 金流（PAYUNi）
- [ ] 👤 `PAYUNI_API_URL` 由 sandbox 改正式：`https://api.payuni.com.tw/api/upp`
- [ ] 👤 換上正式 `PAYUNI_MERCHANT_ID` / `PAYUNI_HASH_KEY` / `PAYUNI_HASH_IV`
- [ ] ⏸️ ~~**LINE Pay 送審**~~（**暫不考慮**，上線只用信用卡；日後要開再送審）

### 電子發票（Amego）
- [ ] 👤 `AMEGO_IDENTIFIER` 改公司正式統編（目前測試值 `12345678`）
- [ ] 👤 `AMEGO_APP_KEY` 改光貿提供的正式金鑰
- [ ] 👤 確認正式環境發票字軌 / 配號已在 Amego 後台設定

### 站台與環境變數
- [ ] 👤 `NEXT_PUBLIC_SITE_URL` 改正式網域（否則 PAYUNi ReturnURL/NotifyURL 失效）
- [ ] 👤 後台 `ADMIN_PASSWORD` 換強密碼、`JWT_SECRET` 換高強度隨機字串
- [ ] 👤 `NEXT_PUBLIC_BUNNY_LIBRARY_ID`（及 `BUNNY_API_KEY` 若需）填正式值
- [ ] 👤 以上所有正式值設定到 **Vercel Production 環境變數**
- [ ] 👤 自訂網域綁定 Vercel + SSL 正常

### 上線前端對端實測（用正式環境，真實小額）
> 逐步步驟與預期結果見 [`test-script.md`](./test-script.md) 第 3~6 段。
- [ ] 🤖👤 刷一筆：付款 → notify 開通（enrollments/subscriptions）→ 開發票 → 開課信
- [ ] 🤖👤 退款測試：`/api/admin/refund`（trade/close → fallback cancel）+ 確認開通已撤銷
- [ ] 🤖👤 優惠券：折後價正確 + 付款成功才 +1

---

## 🟠 P1 — 上線品質（強烈建議月底前）

- [x] 🤖 ~~**優惠券超計 bug**~~：用 `orders.fulfilled_at` 獨立去重旗標（與可重試的開發票分離），並進一步改為**原子式 conditional claim**（`UPDATE … WHERE fulfilled_at IS NULL`），杜絕並發／重送 notify 重複累計＋重複寄信（需執行 `supabase-deploy.sql` 補上 `fulfilled_at` 欄位）
- [ ] 👤 **Brevo 寄件網域 SPF/DKIM 驗證**（否則開課信易進垃圾桶）
- [x] 🤖 ~~付款失敗 / 取消的使用者引導文案~~：`return` 解密回呼判斷結果 → `/success?status=failed` 顯示「付款未完成（未收費）＋重新購買／聯絡客服」引導
- [x] 🤖 ~~開發用一次性路由收口~~（已刪除 debug/fix-bunny/run-migration）
- [x] 🤖 ~~Stripe 殘留清理 + 文件更新~~（README/env 已更新）

---

## 🟡 P2 — 加分（可上線後補）

- [x] 🤖 ~~自動化測試框架~~（已導入 Vitest + plans.js 16 案）
- [x] 🤖 ~~補測：發票統編/載具驗證、checkout 價格決策~~（已抽 `lib/invoice-fields.js` + `lib/order-fulfillment.js` 並補測，共 30 案）
- [ ] 🤖 訂單對帳報表 / 寄信 / 開票失敗告警
- [ ] 🤖 課程影片防下載強化

---

## ✅ 已完成（本輪）
- README / .env 範本改 PAYUNi 買斷制、移除 Stripe（`59d855c`）
- 刪 3 個開發用路由 + 修 `assignment_due` schema 不一致與後台顯示（`28d9b5d`）
- Vitest + `lib/plans.js` 優惠券單元測試 16 案（`acc6060`）

---

## 📅 建議時程
- **第 1 週（本週）**：切換 PAYUNi/Amego/SITE_URL 正式值 + Vercel env；後台密碼/JWT 強化（LINE Pay 暫不考慮，省去審核時程）
- **第 2 週**：正式環境端對端實測（付款→開通→發票→信→退款）；Brevo 網域驗證；優惠券超計 bug
- **第 3 週**：邊界測試；保留 buffer
