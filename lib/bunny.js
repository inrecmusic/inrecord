import crypto from "crypto";

// Bunny Stream Embed View Token URL 簽發。
// token = SHA256_HEX(tokenKey + videoId + expires)，expires 為 UNIX 秒。
// 額外播放參數不納入雜湊（符合 Bunny 規格）。
// 無 tokenKey → 回傳未簽名 URL（向後相容：程式可先上線，待 Bunny 後台開啟
// token 驗證 + 設好 env 後自動生效）。
const EMBED_BASE = "https://iframe.mediadelivery.net/embed";
const DEFAULT_PLAYER_PARAMS = "autoplay=false&loop=false&muted=false&preload=true";

export function signBunnyEmbedUrl(videoId, {
  libraryId,
  tokenKey,
  expiresInSec = 10800, // 3 小時
  now = Date.now(),
  playerParams = DEFAULT_PLAYER_PARAMS,
} = {}) {
  const base = `${EMBED_BASE}/${libraryId}/${videoId}`;
  if (!tokenKey) return `${base}?${playerParams}`;

  const expires = Math.floor(now / 1000) + expiresInSec;
  const token = crypto
    .createHash("sha256")
    .update(tokenKey + videoId + expires)
    .digest("hex");
  return `${base}?token=${token}&expires=${expires}&${playerParams}`;
}
