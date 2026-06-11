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

// ── 分散式限流（Upstash Redis）優先、記憶體保底 ───────────────────────────
// 有 UPSTASH_REDIS_REST_URL / _TOKEN → 全域 sliding window（跨 instance 精準）；
// 缺 env 或 Redis 連線失敗 → 自動退回單機記憶體限流，避免限流層故障擋掉正常請求。
// 回傳 async (key) => { allowed, retryAfter(秒) }
export function createDistributedLimiter({ limit = 20, windowMs = 60_000, prefix = "rl" } = {}) {
  const memory = createRateLimiter({ limit, windowMs });
  let upstash; // undefined=未初始化, null=無設定, 物件=已建立

  async function getUpstash() {
    if (upstash !== undefined) return upstash;
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      upstash = null;
      return upstash;
    }
    const { Ratelimit } = await import("@upstash/ratelimit");
    const { Redis } = await import("@upstash/redis");
    upstash = new Ratelimit({
      redis: new Redis({ url, token }),
      limiter: Ratelimit.slidingWindow(limit, `${Math.round(windowMs / 1000)} s`),
      prefix,
      analytics: false,
    });
    return upstash;
  }

  return async function limit(key) {
    let rl;
    try {
      rl = await getUpstash();
    } catch {
      rl = null;
    }
    if (!rl) return memory(key); // 無設定 → 記憶體保底
    try {
      const { success, reset } = await rl.limit(key);
      return {
        allowed: success,
        retryAfter: success ? 0 : Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
      };
    } catch {
      return memory(key); // Redis 連線失敗 → 記憶體保底
    }
  };
}
