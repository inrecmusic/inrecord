import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { createDistributedLimiter, clientIp } from "@/lib/rate-limit";
import { getJwtSecret } from "@/lib/adminAuth";
import { createHash, timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { auditAdminLogin } from "@/lib/admin-login-audit";

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

  // 防呆（同 getJwtSecret 的做法）：ADMIN_EMAIL／ADMIN_PASSWORD 缺漏時，
  // 舊寫法退回空字串比空字串，會讓「空帳號空密碼」通過驗證，故一律拒絕登入。
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    console.error("[admin login] ADMIN_EMAIL / ADMIN_PASSWORD 未設定，拒絕登入");
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const okCred =
    safeEqual(email || "", adminEmail) &&
    safeEqual(password || "", adminPassword);
  if (!okCred) {
    // 失敗才計次；超過上限回 429
    const rl = await limiter(ip);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "too_many_attempts" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
      );
    }
    await auditAdminLogin(getSupabaseAdmin(), { actor: email || null, method: "password", req, success: false });
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

  await auditAdminLogin(getSupabaseAdmin(), { actor: email, method: "password", req, success: true });
  return NextResponse.json({ ok: true, token });
}
