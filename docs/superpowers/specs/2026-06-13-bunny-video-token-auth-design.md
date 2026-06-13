# 影片防下載強化 — Bunny Embed Token 驗證（設計）

> 日期：2026-06-13　範圍：classroom 課程影片防盜連／防外流
> 等級：Token 簽名 + referer 鎖域（不含 DRM）。方案 A：專用簽發路由。

## 問題

教室影片目前以**公開 embed** 嵌入：

```
https://iframe.mediadelivery.net/embed/{NEXT_PUBLIC_BUNNY_LIBRARY_ID}/{bunny_video_id}?autoplay=false&…
```

URL 在 **client 端**用 `NEXT_PUBLIC_BUNNY_LIBRARY_ID` 直接組出。影片頁雖有登入 + 購買驗證（UI 層），但 **embed URL 本身無 token、無到期、無 referer 限制**：

- 登入學員可複製 iframe 連結外流，且**永久有效**
- 可被任意網域盜連嵌入

## 目標

- embed URL 改為**伺服器端簽發、帶到期時間**的 Bunny Embed View Token
- 簽章金鑰只在伺服器，絕不外露
- 簽發前於伺服器端確認使用者**已購買**（補上目前 embed 缺的權限把關）
- 平滑切換：程式可先上線，待 Bunny 後台開啟 token 驗證 + 設好 env 後自動生效

## Bunny Embed View Token 機制（官方）

- secure URL 附加 `token` 與 `expires` 查詢參數
- `expires`：UNIX 秒（非毫秒/奈秒）
- `token = SHA256_HEX(token_security_key + video_id + expires)`
- 額外播放參數（autoplay 等）**不納入**雜湊，另行附加
- 必須伺服器端產生；`token_security_key` 為函式庫 Security 設定中的 Token Authentication Key（非 API Key）
- 403 通常代表：過期、雜湊錯誤（金鑰/video_id/expires 組合錯）、或缺參數

## 元件

### `lib/bunny.js`（新，純函式）

```
signBunnyEmbedUrl(videoId, { libraryId, tokenKey, expiresInSec = 10800, now = Date.now(), playerParams }) → string
```

- 有 `tokenKey`：
  - `expires = Math.floor(now/1000) + expiresInSec`
  - `token = sha256hex(tokenKey + videoId + expires)`
  - 回傳 `https://iframe.mediadelivery.net/embed/{libraryId}/{videoId}?token={token}&expires={expires}&{playerParams}`
- **無 `tokenKey`：回傳未簽名 URL**（向後相容；若 Bunny 已開 token 驗證則該影片會 403，屬預期）
- 純函式：金鑰與 now 由參數注入，便於測試（比照 `lib/payuni.js`）
- 預設播放參數：`autoplay=false&loop=false&muted=false&preload=true`（與現況一致）

### `GET /api/classroom/video-embed?video_id=…`（新）

1. 取 Bearer token；以 `getUser`（anon client + Authorization header，比照 `verify-purchase`/`games`）驗身分 → 失敗回 **401**
2. 查 `enrollments`：`email = user.email` 且 `course_id = 'piano-101'` → 無則回 **403**（`subscription_required` 風格）
3. 查 `videos`（`id = video_id`）取 `bunny_video_id` / `vimeo_id` → 查無回 **404**
4. 回傳：
   - 有 `bunny_video_id`：`{ provider: "bunny", src: signBunnyEmbedUrl(bunny_video_id, { libraryId, tokenKey, expiresInSec: 10800 }) }`
   - 否則有 `vimeo_id`：`{ provider: "vimeo", src: "https://player.vimeo.com/video/{vimeo_id}?autoplay=0&title=0&byline=0&portrait=0" }`（legacy，未簽）
   - 兩者皆無：404
- `libraryId = process.env.NEXT_PUBLIC_BUNNY_LIBRARY_ID`、`tokenKey = process.env.BUNNY_TOKEN_KEY`

### `app/classroom/page.jsx`（改）

- 移除 client 端直接組 Bunny URL 的邏輯
- `currentVideo` 變動時 `fetch('/api/classroom/video-embed?video_id=' + id, { headers: { Authorization: Bearer } })`，將回傳 `src` 存入 state
- 播放器區：載入中顯示 loading；取得後依 `provider` 渲染對應 iframe（src 來自後端）
- Vimeo 後備改用後端回傳的 src（行為不變）

## 資料流

學員選影片 → client 帶 Bearer token 打 `/video-embed` → 伺服器驗身分 + 購買 → 簽發 src → 回傳 → iframe 載入簽名 URL → Bunny 驗 token+expires+referer → 播放。

> 效能：影片串流/緩衝速度不變（同 CDN）。唯一成本是切換影片時、播放器出現前多一次輕量後端往返（驗 JWT + 查 enrollment + SHA256，無外呼，約 100–300ms）。播放開始後無感。**採單純版（每次切換即時索取），不做預取。**

## env 與後台設定（👤）

- 新增 **`BUNNY_TOKEN_KEY`**（伺服器專用，**非** `NEXT_PUBLIC`）— Bunny Stream 函式庫的 Token Authentication Key
- 沿用 `NEXT_PUBLIC_BUNNY_LIBRARY_ID`（本就出現在 URL，公開無妨）
- 更新 `.env.local.example`（Bunny 區補 `BUNNY_TOKEN_KEY` 說明）
- 👤 Bunny 後台：該 Stream 函式庫開啟 **Token Authentication**；**Allowed Referrers** 設正式網域
- ⚠️ referer 鎖域與本機開發衝突：開發時 referer 多為 `localhost`，需在 Allowed Referrers 加入本機網域，或開發環境不設 referer 限制、僅靠 token 驗證

## 錯誤處理

- 缺 `BUNNY_TOKEN_KEY`：簽發路由回未簽 URL（平滑切換；Bunny 已開 token 驗證時該影片 403，屬預期）
- 缺 `NEXT_PUBLIC_BUNNY_LIBRARY_ID`：回 404 / 設定錯誤（與現況一致，無法播放）
- token 到期：3 小時（10800 秒）；每次切換影片重新索取，影響面最小
- 未登入 401 / 未購買 403 / 無影片 404

## 測試（`lib/bunny.test.js`，純函式）

- 有金鑰 → URL 含 `token`（64 hex）與 `expires`，且 `token === SHA256_HEX(tokenKey + videoId + expires)`
- 有金鑰 → `expires === floor(now/1000) + expiresInSec`（注入固定 now 驗證）
- 無金鑰 → 未簽名 URL（不含 `token`/`expires` 參數）
- 播放參數正確附加於 query

## 範圍外（YAGNI）

- Vimeo legacy 維持未簽、不動
- 不做 DRM（MediaCage）
- 影片浮水印不在此次（遊戲已有，日後可另議）
- 不做預取/預簽優化（單純版）
