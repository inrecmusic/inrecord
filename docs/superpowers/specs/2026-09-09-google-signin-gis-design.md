# Google 登入改用 Google Identity Services（自家頁面登入）— 設計

日期：2026-09-09　狀態：待使用者審閱

## 目標與動機

- Google「選擇帳戶」頁目前顯示「繼續使用 vmslzbcegfljlopkewpx.supabase.co」，原因是登入流程由 Supabase 代為與 Google 對話，導回網址在 supabase.co，Google 以導回網域顯示。
- 改成在 inrecordmusic.com 自己的登入頁用 Google 官方登入元件（Google Identity Services，GIS）取得 Google ID token，再交給 Supabase `signInWithIdToken` 建立登入。整個流程都在自家網域，帳戶選擇頁會顯示 InRecord／inrecordmusic.com。
- 費用 0；不需要 Supabase 自訂網域附加功能（每月 10 美元）；現有學員不會被登出。

## 範圍

**做**
- `app/classroom/login/page.jsx` 的 Google 登入按鈕改為 GIS 標準按鈕（`ux_mode: popup`），成功後以 nonce 驗證交給 Supabase。
- 保留現有「Email 連結／驗證碼登入」不動。
- 保留現有 in-app 瀏覽器（IG／LINE 內建瀏覽器）判斷：in-app 時一樣隱藏 Google 登入。
- 保底：GIS 腳本載入失敗或回錯（例如 Supabase 未收錄該 Client ID）時，顯示舊的「改用 Google 網頁登入」連結走原本 `signInWithOAuth` 流程，功能不中斷。
- CSP 白名單加入 `https://accounts.google.com`（script-src、connect-src、frame-src）。
- 新環境變數 `NEXT_PUBLIC_GOOGLE_CLIENT_ID`（Production＋Preview）。

**不做**
- One Tap 自動彈出（可日後以旗標開）；Supabase 自訂網域；其他第三方登入。

## 流程

1. 登入頁載入 GIS 腳本 `https://accounts.google.com/gsi/client`（`next/script`，`afterInteractive`）。
2. 每次載入頁面產生一組 nonce：原始值 `nonce`（隨機 32 bytes base64）與 `SHA-256` 十六進位 `hashedNonce`。
3. `google.accounts.id.initialize({ client_id, callback, nonce: hashedNonce, use_fedcm_for_prompt: true })`，並以 `google.accounts.id.renderButton(el, { type: "standard", shape: "pill", theme: "outline", text: "signin_with", size: "large", width })` 畫出按鈕。
4. 使用者點按鈕 → Google 彈窗選帳戶 → callback 收到 `credential`（ID token）。
5. `supabase.auth.signInWithIdToken({ provider: "google", token: credential, nonce })`。
6. 成功 → 依現有 `safeNextPath` 導向 `?next=`（預設 `/classroom`）。失敗 → 顯示錯誤文案並露出保底連結。
7. Lead／PageView 追蹤照舊；登入成功不另外送事件。

## 設定（一次性，使用者操作或我協助）

- **Google Cloud Console → OAuth 用戶端（Web）**：「已授權的 JavaScript 來源」加入 `https://inrecordmusic.com`、`https://inrecord-preview-inrec.vercel.app`、`http://localhost:3000`。導向 URI 維持原本 Supabase 的 callback（保底流程仍用）。
- **Supabase Dashboard → Authentication → Providers → Google**：確認同一個 Web Client ID 已填在 Client IDs（`signInWithIdToken` 會驗 token 的 audience）；「Skip nonce check」保持關閉。
- **Vercel**：`NEXT_PUBLIC_GOOGLE_CLIENT_ID`（公開值，非機密）設 Production 與 Preview。

## 錯誤處理

| 情境 | 行為 |
|---|---|
| GIS 腳本被擋／載入失敗 | 按鈕位置顯示「改用 Google 網頁登入」（原流程） |
| `signInWithIdToken` 回 audience／nonce 錯誤 | 顯示「Google 登入暫時無法使用，請改用 Email 登入」＋保底連結；console.error 記錄 |
| 使用者關掉彈窗 | 無動作 |
| in-app 瀏覽器 | 同現況：不顯示 Google，提示改用 Email |

## 測試

- `lib/google-signin.js` 純函式：`generateNonce()` 回 `[nonce, hashedNonce]`，hashed 為 64 位十六進位、與 nonce 的 SHA-256 相符；`gisReady()` 判斷。
- 登入頁元件測試（jsdom）：mock `window.google.accounts.id`；渲染時呼叫 `initialize`（帶 hashedNonce）與 `renderButton`；模擬 callback → 呼叫 `supabase.auth.signInWithIdToken`（provider google、token、原始 nonce）→ 導向 next；signIn 失敗顯示錯誤與保底連結；in-app 模式不渲染。
- 手動：preview 上用真實 Google 帳號登入一次，確認帳戶選擇頁顯示 InRecord、登入後進教室。

## 影響評估

- 只改登入頁與 CSP、加一個公開環境變數。不動 `/auth/callback`、Email 登入、教室、後台。
- 既有 session 不受影響（Supabase URL 沒變）。

## 上線步驤

1. 使用者提供 Google Web Client ID（Supabase Dashboard → Authentication → Providers → Google 頁面可直接複製，屬公開值）；Google Console 加 JavaScript 來源；Supabase 確認 Client ID。
2. Vercel Preview 設 env → 部署 preview → 使用者真實登入測試。
3. Vercel Production 設 env → `vercel --prod`。
