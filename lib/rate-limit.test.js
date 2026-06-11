import { describe, it, expect } from "vitest";
import { createRateLimiter, clientIp } from "./rate-limit.js";

describe("createRateLimiter", () => {
  it("在視窗內達到上限後拒絕，並回報 retryAfter", () => {
    let now = 0;
    const rl = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => now });

    expect(rl("ip-a").allowed).toBe(true);  // 1
    expect(rl("ip-a").allowed).toBe(true);  // 2
    expect(rl("ip-a").allowed).toBe(true);  // 3
    const blocked = rl("ip-a");             // 4 → 擋
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBe(60);
  });

  it("不同 key 各自獨立計數", () => {
    let now = 0;
    const rl = createRateLimiter({ limit: 1, windowMs: 1000, now: () => now });
    expect(rl("ip-a").allowed).toBe(true);
    expect(rl("ip-a").allowed).toBe(false);
    expect(rl("ip-b").allowed).toBe(true); // b 不受 a 影響
  });

  it("視窗過後重置計數", () => {
    let now = 0;
    const rl = createRateLimiter({ limit: 1, windowMs: 1000, now: () => now });
    expect(rl("ip-a").allowed).toBe(true);
    expect(rl("ip-a").allowed).toBe(false);
    now = 1000; // 視窗到期
    expect(rl("ip-a").allowed).toBe(true);
  });
});

describe("clientIp", () => {
  const mk = (headers) => ({ headers: { get: (k) => headers[k] ?? null } });

  it("取 x-forwarded-for 的第一個 IP", () => {
    expect(clientIp(mk({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
  });
  it("退而求其次取 x-real-ip", () => {
    expect(clientIp(mk({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
  });
  it("皆無時回 unknown", () => {
    expect(clientIp(mk({}))).toBe("unknown");
  });
});
