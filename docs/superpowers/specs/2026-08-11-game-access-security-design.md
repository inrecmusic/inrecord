# 互動遊戲存取安全強化 設計

- 日期：2026-08-11
- 狀態：設計已核可，待寫實作計畫
- 相關現況：
  - `app/api/classroom/games/route.js`：遊戲 API。GET 帶 JWT 登入驗證（`auth.getUser`）＋ `subscriptions`（active 且未過期）購買驗證；`html_content` 回傳前注入 email 浮水印＋防 iframe 嵌入 script；清單 strip `html_content`。
  - `app/classroom/page.jsx` `GamesTab`：前端遊戲呈現。`url` 類型 → `<iframe src={selectedGame.external_url}>`（直連外部公開網址）；`html` 類型 → `<iframe srcDoc={html_content} sandbox="allow-scripts allow-forms">`。
  - `app/admin/GamesManagePage.jsx`：後台遊戲管理（建立/編輯遊戲，選 game_type）。
  - `games` 表：欄位 `id/title/chapter_id/html_content/sort_order/description/game_type/external_url/is_active/video_id/updated_at`；`game_type` 預設 `'html'`；RLS 只剩 service_role（anon 讀不到，見 `supabase-hardening.sql`）。
  - middleware matcher `["/classroom/:path*","/auth/:path*"]`；`/api/classroom/*` 不經 middleware，但各 API 自帶 auth。

## 背景與目標
確保付費互動遊戲「一定要開瀏覽器、登入帳號、且有購買」才能玩，防止分享網址讓外部人使用。現況調查發現 html 類型已有完整保護，但有三個缺口：

1. **url 類型漏洞（實際存在）**：`url` 遊戲用 `<iframe src={external_url}>` 直連外部公開網址，`external_url` 在列表 API 就回傳、學員從瀏覽器 network 可見並分享，完全繞過登入/購買。目前正式站唯一的遊戲 "Demo"（`musicgame-fdy86usn.manus.space`）就是此類型。
2. **無帳號共享防護**：同一帳號可無限多裝置同時使用（把帳號借給多人）。目前無任何登入/裝置記錄。
3. **內容可存檔外流**：html 內容送到瀏覽器 srcDoc 後可被存下離線分享。

## 需求（定案）
- **url**：付費遊戲一律 `html_content` 類型；`url` 類型明確定位為「公開試玩」（不受購買保護、可自由分享），後台防誤用。
- **帳號共享**：同時登入裝置上限（預設 3、後台可調），超過的裝置擋**遊戲**存取（軟性——只擋遊戲、不動 Supabase 登入、不影響看影片）。
- **內容防護**：務實派——強化浮水印（可溯源）＋ 遊戲內容不快取。html 存檔無法根絕，以嚇阻＋追責為目標。

## 設計

### A. url 漏洞 → 公開試玩明確化
問題不在「url 類型不安全」，而在「沒區分它是公開試玩」。付費內容改用 html、url 保留給公開試玩。
- **語意**：`url` 類型＝公開試玩（本就是公開 external_url、可分享，這 OK）；`html_content` 類型＝付費內容（有完整保護）。
- **後台 `GamesManagePage`**：選 `game_type=url` 時顯示明顯提示「⚠️ 公開試玩：內容任何人都能開啟／分享，**付費內容請改用 HTML 內嵌**」。
- **前端 `GamesTab`**：`url` 遊戲在清單／播放區掛「試玩」標籤，與付費遊戲視覺區分。
- 現有 "Demo" 正式定位為公開試玩，內容不變。

### B. 帳號共享偵測 —— 裝置上限（軟性、遊戲層）
- **新表 `game_devices`**（一 user 多列，每列一裝置）：見資料模型。
- **device_id**：前端首次在 `localStorage` 產生一組 uuid（key 如 `inrec_device_id`），之後每次遊戲請求都帶（query 或 header）。
- **遊戲 API（`app/api/classroom/games` GET）在購買驗證通過後**：
  1. `upsert` 當前 `device_id` 的 `last_seen_at=now`、`user_agent`、`ip`（`user_id` 取自 JWT、不信前端）。
  2. 撈該 `user_id` 所有裝置，依 `last_seen_at` 由新到舊排序，取前 `limit` 台為「允許集」。
  3. 當前 `device_id` **不在允許集** → 回 `403 { error: "device_limit", limit }`（前端顯示「已達裝置上限（N 台），請在其他裝置登出或聯繫客服」）。
  4. 在允許集 → 照常回遊戲內容。
- **上限存後台設定** `game_settings.device_limit`（預設 3），比照 `sale_settings` 即時可改免部署。
- **純函式** `pickAllowedDeviceIds(devices, limit)`：輸入裝置陣列（含 `device_id`/`last_seen_at`）與上限，回傳允許的 `device_id` 集合（依 last_seen 取最新 N）。供 API 呼叫、可單元測試。
- **性質**：軟性上限——擋的是**遊戲存取**，不動 Supabase 登入、不影響看影片。第 4 台想玩會把最舊那台擠出允許集（該台下次存取遊戲被擋）。

### C. 內容防護（務實）
- **強化浮水印**：現有單一固定位置 `email · InRecord` → 改為**多處分散＋含日期**（如 `${email} · ${YYYY-MM-DD} · InRecord`，右上/中央/左下數處，opacity 極低不影響遊玩）。純函式 `buildWatermark(email, dateStr)` 產生要注入的 HTML 片段，可測。
- **遊戲內容不快取**：`html_content` 的 GET 回應加 `Cache-Control: no-store`（不落瀏覽器磁碟快取）。
- srcDoc 的 `sandbox="allow-scripts allow-forms"` ＋ 防嵌入 script 保留不動。

## 資料模型

```sql
-- 帳號共享偵測：每 user 每裝置一列
CREATE TABLE IF NOT EXISTS game_devices (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id    TEXT NOT NULL,                 -- 前端 localStorage uuid
  user_agent   TEXT,
  ip           TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, device_id)
);
CREATE INDEX IF NOT EXISTS game_devices_user_lastseen_idx
  ON game_devices (user_id, last_seen_at DESC);
ALTER TABLE game_devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_game_devices" ON game_devices;
CREATE POLICY "service_role_game_devices" ON game_devices
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 遊戲設定（單列，後台可調）
CREATE TABLE IF NOT EXISTS game_settings (
  id           TEXT PRIMARY KEY DEFAULT 'default',
  device_limit INT NOT NULL DEFAULT 3,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO game_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;
ALTER TABLE game_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_game_settings" ON game_settings;
CREATE POLICY "service_role_game_settings" ON game_settings
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
```
放新 idempotent `supabase-game-security.sql`，部署序在 `supabase-hardening.sql` 之前。

## 檔案清單
| 檔案 | 動作 |
|---|---|
| `supabase-game-security.sql`（新） | `game_devices` ＋ `game_settings` 表（service_role RLS、idempotent） |
| `lib/game-devices.js`（新）＋ test | 純函式 `pickAllowedDeviceIds(devices, limit)`、`buildWatermark(email, dateStr)` |
| `app/api/classroom/games/route.js` | ①device upsert＋上限檢查（403 device_limit）②`no-store` header ③浮水印改用 `buildWatermark` |
| `app/classroom/page.jsx`（`GamesTab`） | ①device_id 產生＋localStorage＋帶進遊戲請求 ②url 遊戲「試玩」標籤 ③處理 403 device_limit 顯示提示 |
| `app/admin/GamesManagePage.jsx` | ①`game_type=url` 的「公開試玩」提示 ②裝置上限（`game_settings.device_limit`）設定 UI |

## 測試
- **純函式**（`lib/game-devices.js`）：
  - `pickAllowedDeviceIds`：裝置數 ≤ limit 全允許；> limit 只留最新 N（依 last_seen_at）；當前裝置在/不在允許集；空陣列。
  - `buildWatermark`：含 email 與日期、多處片段、回傳字串可注入。
- **API 授權閘**：無 token→401、無購買→403 subscription_required、超裝置上限→403 device_limit；device upsert 的 user_id 取自 JWT（不信前端 body）。

## 不做（YAGNI）
- 不做真正的 Supabase session revoke（軟性遊戲層上限即可達目的、不誤動全站登入）。
- 不做前端右鍵/F12 阻擋（可繞過、影響正常遊玩）。
- 不做遊戲內容 token 短效／分段載入（實作複雜、效益低）。
- url 類型不做代理隱藏保護（改定位為公開試玩）。
- 裝置上限只作用於遊戲存取，不擴及影片／其他教室內容（降低誤傷）。

## 風險與注意
- **device_id 可繞過**：學員清 localStorage 換新 device_id 可繞過，但新裝置會擠掉自己最舊的 → 對「一個帳號分十幾人」的大量共享仍有效壓制；搭配浮水印可追責。屬可接受限制。
- **裝置上限誤傷**：頻繁換裝置的正常學員可能碰上限 → 預設 3 台＋後台可調＋「聯繫客服」出口緩解。
- **浮水印／no-store 無法根絕存檔**：本質限制，以嚇阻＋洩漏溯源為目標。
- **只擋遊戲不擋影片**：刻意取捨（遊戲是重點保護對象、看影片不受裝置上限影響以降低誤傷）；若日後要一併保護影片再議。
- **非法律意見**：帳號共享條款建議同步寫入服務條款。
