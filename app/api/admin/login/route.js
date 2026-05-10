import { NextResponse } from "next/server";
import { SignJWT } from "jose";

// In-memory rate limiter: ip -> { count, lockedUntil }
const attempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

function getClientIp(req) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(req) {
  const ip = getClientIp(req);
  const now = Date.now();
  const record = attempts.get(ip) || { count: 0, lockedUntil: 0 };

  if (record.lockedUntil > now) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  const { email, password } = await req.json();

  if (
    email !== process.env.ADMIN_EMAIL ||
    password !== process.env.ADMIN_PASSWORD
  ) {
    record.count += 1;
    if (record.count >= MAX_ATTEMPTS) {
      record.lockedUntil = now + LOCK_MS;
    }
    attempts.set(ip, record);
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  // Success — reset counter
  attempts.delete(ip);

  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({ email, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret);

  return NextResponse.json({ ok: true, token });
}
