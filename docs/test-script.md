# InRecord 上線前手動測試腳本

> 目的:驗證程式無法自動測的端對端流程與本輪修正。每項都有 **前置 / 步驟 / 預期 / ☐ 結果**。
> 建議環境:Vercel preview 或正式環境(金流/發票要連真實服務才測得到)。
> 圖例:🖱️ 介面操作　⌨️ 終端機 curl　🔑 需要 token

---

## 0. 準備:取得測試用 token

### 學員 token(教室相關測試用)
🖱️ 用測試帳號登入 `/classroom/login` → 開瀏覽器 DevTools → Console 貼:
```js
const { data } = await window.supabase?.auth.getSession?.() || {};
console.log((await (await import('@supabase/supabase-js')) , (JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.includes('auth-token'))))?.access_token)));
```
或最簡單:登入後在 Network 面板看任一 `/api/classroom/*` 請求的 `Authorization: Bearer ...` 直接複製。

### 管理者 token(後台 API 測試用)
⌨️
```bash
curl -s -X POST "$SITE/api/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"ADMIN_EMAIL","password":"ADMIN_PASSWORD"}'
# 回傳 {"ok":true,"token":"..."} → 存成 $ADMIN
```
> 下方 curl 先設 `SITE=https://你的網域`、`ADMIN=上面拿到的 token`、`USER=學員 token`。

---

## 1. 🔴 教室存取閘門(本輪 P0 修正)

### 1-1 token 偽造防護(核心驗證)
- **前置**:A=已購買帳號的 token(`$USER`);B=未購買帳號的 email。
- ⌨️ 步驟:
  ```bash
  # 用 A 的 token,但完全不傳 body email
  curl -s -X POST "$SITE/api/classroom/verify-purchase" \
    -H "Authorization: Bearer $USER"
  # 不帶 token
  curl -s -X POST "$SITE/api/classroom/verify-purchase"
  ```
- **預期**:
  - 帶有效 token → `{"hasPurchased":true}`(依該帳號實際購買狀態)
  - 不帶 token → HTTP 401 `{"hasPurchased":false}`
  - **關鍵**:已無法用 body 傳別人 email 來偽造(body 已被忽略)
- ☐ 結果:

### 1-2 未購買者進教室
- 🖱️ 用「未購買課程」帳號登入 `/classroom`
- **預期**:看到「尚未購買課程」畫面(非課程內容);章節/影片不載入
- ☐ 結果:

### 1-3 未開通遊戲者
- 🖱️ 用「只買課程、沒買 AI 遊戲」帳號進教室 → 點 AI 遊戲區
- **預期**:顯示「尚未開通 AI 遊戲」;`GET /api/classroom/games` 回 403
- ☐ 結果:

### 1-4 遊戲浮水印 / 防盜
- 🖱️ 用已開通遊戲帳號開啟任一遊戲
- **預期**:遊戲畫面有 `學員email · InRecord` 半透明浮水印;非從本站 iframe 嵌入時會被防盜 script 擋
- ☐ 結果:

---

## 2. 🔴 優惠券去重(本輪 P0 修正)

> 前置:已執行 `supabase-deploy.sql`(orders 須有 `fulfilled_at` 欄位)。

### 2-1 正常累計
- 🖱️ 建一張 `usage_limit` 充足的優惠券 → 用它完成一筆付款
- **預期**:`coupons.used` +1;`orders.coupon_code` 有值;`orders.fulfilled_at` 被寫入時間
- ☐ 結果:

### 2-2 發票失敗不重複累計(關鍵迴歸)
- **前置**:故意讓發票開立失敗(例:暫時用錯 `AMEGO_APP_KEY`,或挑一筆 `invoice_no` 為 null、`invoice_error` 有值的訂單)
- ⌨️ 對同一筆訂單重送 notify(或在後台多次觸發補開發票失敗)
- **預期**:`coupons.used` **不再每次 +1**(只在第一次 `fulfilled_at` 寫入時 +1);開課信也只寄一次
- ☐ 結果:

---

## 3. 🔴 金流端對端(真實小額)

- **前置**:PAYUNi/Amego/`NEXT_PUBLIC_SITE_URL` 皆已切正式值並設到 Vercel Production
- 🖱️ 步驟:首頁選方案 → 登入 → BuyModal 填發票資訊 → 完成付款
- **預期(逐項確認)**:
  - ☐ 付款成功導回 `/success`,顯示訂單編號
  - ☐ `course`/`bundle` → `enrollments` 出現該 email + `piano-101`
  - ☐ `game`/`bundle` → `subscriptions` 出現 `source='purchase'`、`expires_at=2999-12-31`
  - ☐ `orders.invoice_no` 有發票號碼、`invoice_error` 為 null
  - ☐ 收到 Brevo 開課確認信
  - ☐ 教室能正常看到課程內容 / 遊戲已開通

### 3-1 LINE Pay(審核通過後)
- 🖱️ 整合支付頁出現 LINE Pay 選項 → 走完一次
- ☐ 結果:

---

## 4. 🔴 三種發票方式

對每種各刷一筆(可小額),確認 Amego 後台實際開出:
- ☐ **Email 載具**(不填統編、不選手機條碼)
- ☐ **手機條碼載具**(`/` 開頭 7 碼);填錯格式應在結帳前被擋(`invalid_carrier_id` / `carrier_not_exist`)
- ☐ **公司統編**(8 碼);填錯/不存在應被擋(`invalid_tax_id` / `tax_id_not_exist` / `missing_company_name`)

---

## 5. 🔴 退款雙路徑

> ⚠️ 真實退款,挑小額測試訂單。退款入參為訂單 `id`(orders.id)。

### 5-1 已請款 → trade/close
- **前置**:一筆已付款且 PAYUNi 已請款的訂單 id
- ⌨️
  ```bash
  curl -s -X POST "$SITE/api/admin/refund" \
    -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" \
    -d '{"id":"訂單UUID"}'
  ```
- **預期**:走 `trade/close`(CloseType=2)成功 → `orders.status='refunded'`;對應 `enrollments` 刪除、`subscriptions` 撤銷
- ☐ 結果:

### 5-2 未請款 → fallback trade/cancel
- **前置**:一筆仍在授權狀態(尚未請款)的訂單
- ⌨️ 同上 curl
- **預期**:`trade/close` 失敗 → 自動 fallback `trade/cancel`(取消授權)成功 → 同樣轉 `refunded` 並撤銷開通
- ☐ 結果:

---

## 6. 🟠 手動補開發票

- **前置**:一筆 `status='paid'` 且 `invoice_no` 為 null 的訂單(後台訂單頁會有「待補開」badge)
- ⌨️
  ```bash
  curl -s -X POST "$SITE/api/admin/issue-invoice" \
    -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" \
    -d '{"id":"訂單UUID"}'
  ```
- **預期**:開立成功 → `orders.invoice_no` 有值、`invoice_error` 清為 null;後台 badge 消失
- ☐ 結果:

---

## 7. 🟠 BuyModal 錯誤文案(本輪 P1 修正)

- 🖱️ 製造一個 checkout 失敗情境(例:測試環境暫時拔掉 `PAYUNI_MERCHANT_ID`),按購買
- **預期**:顯示「付款服務暫時無法使用,請稍後再試或與我們聯繫。」——**不得**出現 `PAYUNI_MERCHANT_ID` 等環境變數名
- 🖱️ 用過期/停用優惠券 → 預期顯示對應中文(如「優惠碼已過期」)
- ☐ 結果:

---

## 8. 🟠 後台功能巡檢

逐一點開、確認不報錯:
- ☐ 後台登入(`/admin`,首頁 Logo 雙擊進入)
- ☐ 「測試付款」鈕 → 顯示「✅ Payuni 連線正常」(本輪已修 plan key + email)
- ☐ 「測試 Brevo」鈕 → 顯示「✅ Brevo 連線正常」
- ☐ 課程 CRUD / 章節・單元・影片 CRUD / 遊戲 CRUD
- ☐ 優惠券 CRUD(折扣計算正確)
- ☐ 訂單清單顯示(發票狀態、退款狀態)
- ☐ 評論回覆 / 評分回覆 / 作業批改 送出與顯示

---

## 9. 課程網站雜項

- ☐ Footer Instagram 連結開新分頁到 `instagram.com/inrec.music`(YouTube/Line 已暫時隱藏,待補連結)
- ☐ 試看 Email(PreviewModal)送出成功、加入 Brevo 名單
- ☐ `/contact`、`/privacy`、`/terms`、`/success` 內容正常
- ☐ 手機版 BuyModal 表單(統編、手機條碼欄位)好操作

---

## 回歸(每次部署後快速跑)
- ☐ `npx vitest run`(16 案)
- ☐ `npx next build` 無錯
- ☐ 教室登入 → 看得到課程(token 流程正常)
- ☐ 刷一筆最便宜方案完整走一次
