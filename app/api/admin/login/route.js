import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { createDistributedLimiter, clientIp } from "@/lib/rate-limit";
import { getJwtSecret } from "@/lib/adminAuth";
import { createHash, timingSafeEqual } from "crypto";

// 定值時間比較：先 SHA256 等長化，避免長度洩漏、也避免 timingSafeEqual 對不等長 buffer 拋錯
function safeEqual(a, b) {
  const ha = createHash("sha256").update(String(a)).digest();
  const hb = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

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

  const okCred =
    safeEqual(email || "", process.env.ADMIN_EMAIL || "") &&
    safeEqual(password || "", process.env.ADMIN_PASSWORD || "");
  if (!okCred) {
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
  const secret = getJwtSecret();
  if (!secret) {
    console.error("[admin login] JWT_SECRET 未設定或長度不足，拒絕簽發 token");
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }
  const token = await new SignJWT({ email, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret);

  return NextResponse.json({ ok: true, token });
}
