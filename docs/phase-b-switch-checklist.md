# Phase B — 正式金鑰切換 + 小額驗證 + 善後 Runbook

> 用途：sandbox 全流程（Phase A）已驗證後，上線前用「正式金鑰 + 真實小額交易」確認金流／發票真的接通。
> 這是 [`launch-checklist.md`](./launch-checklist.md) 🔴 P0 的**可執行細化版**，重點補上**善後步驟**。
> ⚠️ 一旦切正式：刷卡是真錢、發票是**已向財政部申報**的合法發票，測完必須退款 + 作廢。

---

## 1. 切換對照表（測試 → 正式）

| 變數 | 測試值（現況） | 正式值 | 設定位置 |
|------|----------------|--------|----------|
| `PAYUNI_API_URL` | `https://sandbox-api.payuni.com.tw/api/upp` | `https://api.payuni.com.tw/api/upp` | Vercel Production |
| `PAYUNI_MERCHANT_ID` | `S044...`（測試特店） | 正式特店代號 | Vercel Production |
| `PAYUNI_HASH_KEY` | 測試金鑰 | 正式 HashKey | Vercel Production |
| `PAYUNI_HASH_IV` | 測試 IV | 正式 HashIV | Vercel Production |
| `AMEGO_IDENTIFIER` | `12345678`（公用測試統編） | 碩樂公司**正式統編** | Vercel Production |
| `AMEGO_APP_KEY` | 測試 App Key | 光貿提供的正式金鑰 | Vercel Production |
| `AMEGO_API_URL` | `https://invoice-api.amego.tw` | 正式網址（光貿確認，多半同網址） | Vercel Production |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | 正式網域（否則 ReturnURL/NotifyURL 失效） | Vercel Production |

> 全部設到 **Vercel Production 環境變數**，不要只改本機 `.env.local`。本機 `.env.local` 維持測試值，避免本機誤觸正式金流。

### 前置（外部後台，有審核時程，先辦）
- [ ] Amego 後台已設定正式環境**發票字軌／配號**（沒設會開票失敗）
- [ ] PAYUNi 商店後台已啟用信用卡付款方式（LINE Pay 暫不考慮，不送審）

---

## 2. 小額驗證（正式環境）

> 在**正式網域**操作，不是本機。逐步腳本見 [`test-script.md`](./test-script.md) 第 3~6 段。

- [ ] 用真卡買一筆**最低價方案**（course NT$3,800；若要更省可先建一張高折扣測試優惠券）
- [ ] 確認：付款成功 → `orders.status=paid`
- [ ] 確認：`enrollments`（course/bundle）或 `subscriptions`（bundle 的遊戲）已開通
- [ ] 確認：收到開課確認信（Brevo）
- [ ] 確認：`orders.invoice_no` 有正式發票號，且能在**財政部電子發票整合服務平台**查到

---

## 3. 善後 Runbook（測完**務必**全做，否則影響帳務/稅務）

> 用你買測試的那筆 email/訂單編號操作。建議測試時就用可辨識的 email（如自己的 + `+test` 別名）。

### 3-1 退款（PAYUNi）
- [ ] 後台 → 訂單管理 → 找到該筆 → 退款
  - 走 `/api/admin/refund`：先 `trade/close`（CloseType=2 請退款），失敗 fallback `trade/cancel`（取消授權）
  - 成功後訂單轉 `refunded`，並自動撤銷對應 `enrollments` / `subscriptions`

### 3-2 作廢發票（Amego，正式才需要）
- [ ] 登入 Amego **正式後台** → 找到該發票號 → 作廢（f0501）
  - ⚠️ 正式發票已申報，必須作廢；專案目前**沒有程式作廢功能**，需在 Amego 後台手動處理
  - （測試環境用統編 `12345678` 開的發票未送財政部，留著無害，作廢只是整潔）

### 3-3 清除測試資料（Supabase）
- [ ] 刪掉該筆測試 `orders` / `enrollments` / `subscriptions`
  - **防呆鐵則**：絕不刪 `inrecmusic@gmail.com`、`alan52jay@gmail.com` 的資料
  - 參考 Phase A 用過的清理腳本 `/tmp/cleanup-sandbox.mjs`（依 email 刪、含受保護清單）

---

## 4. 切回測試 / 收尾
- [ ] 確認 Vercel Production 已是正式值且部署成功（記得 `npx vercel --prod`，本專案未連動 GitHub 自動部署）
- [ ] 移除一次性測試路由 `app/api/test/invoice`（production 雖已 404，上線前仍建議刪）
- [ ] 本機 `.env.local` 保持測試值，日後開發不誤觸正式金流
