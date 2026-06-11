// 極輕量的記憶體型固定視窗限流（無外部依賴）。
//
// 注意：Serverless（Vercel）記憶體不跨實例共享，這只提供「單一暖實例」層級的
// 基本防濫用，足以擋掉腳本對單一公開端點的高頻打點；若要全域強限流，
// 改接 Upstash Redis 等共享儲存。純函式設計（可注入 now/store）便於單元測試。

const MAX_KEYS = 10_000; // 防止不同 IP 無限長大造成記憶體洩漏

// 建立限流器：每個 key 在 windowMs 內最多 limit 次。
// 回傳 rateLimit(key) → { allowed, remaining, retryAfter(秒) }
export function createRateLimiter({ limit = 20, windowMs = 60_000, now = () => Date.now() } = {}) {
  const hits = new Map(); // key -> { count, resetAt }

  function sweep(t) {
    for (const [k, v] of hits) {
      if (t >= v.resetAt) hits.delete(k);
    }
  }

  return function rateLimit(key) {
    const t = now();
    const entry = hits.get(key);

    if (!entry || t >= entry.resetAt) {
      if (hits.size >= MAX_KEYS) sweep(t);
      hits.set(key, { count: 1, resetAt: t + windowMs });
      return { allowed: true, remaining: limit - 1, retryAfter: 0 };
    }
    if (entry.count >= limit) {
      return { allowed: false, remaining: 0, retryAfter: Math.ceil((entry.resetAt - t) / 1000) };
    }
    entry.count += 1;
    return { allowed: true, remaining: limit - entry.count, retryAfter: 0 };
  };
}

// 取得用戶端 IP：Vercel 會設定 x-forwarded-for（可能含多個，取第一個）
export function clientIp(req) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}
