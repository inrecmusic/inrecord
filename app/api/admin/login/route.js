import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { createDistributedLimiter, clientIp } from "@/lib/rate-limit";

// 後台登入暴力破解防護：每 IP 15 分鐘最多 5 次「失敗」嘗試（全域，缺 Redis 時記憶體保底）。
// 只在密碼錯誤時計次，登入成功不扣額 —— 保留原本的語意，但改為跨 instance 精準。
const limiter = createDistributedLimiter({
  limit: 5,
  windowMs: 15 * 60 * 1000,
  prefix: "rl:admin-login",
});

export async function POST(req) {
  const ip = clientIp(req);
  const { email, password } = await req.json();

  if (
    email !== process.env.ADMIN_EMAIL ||
    password !== process.env.ADMIN_PASSWORD
  ) {
    // 失敗才計次；超過上限回 429
    const rl = await limiter(ip);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "too_many_attempts" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
      );
    }
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  // 成功 —— 不消耗限流額度
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({ email, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret);

  return NextResponse.json({ ok: true, token });
}
