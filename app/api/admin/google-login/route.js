import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getJwtSecret } from "@/lib/adminAuth";
import { auditAdminLogin } from "@/lib/admin-login-audit";

export async function POST(req) {
  const authHeader = req.headers.get("authorization");
  const accessToken = authHeader?.replace("Bearer ", "");
  if (!accessToken) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "server_not_configured" }, { status: 500 });
  }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !user) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }

  if (user.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: "not_admin" }, { status: 403 });
  }

  // 必須是「已驗證 email」且「透過 Google 登入」才發後台 token。
  // 擋掉：站上有開 email/密碼註冊，若 Supabase email 確認關閉，有人可自助註冊成 ADMIN_EMAIL 冒充管理員。
  const providers = user.app_metadata?.providers || [];
  const viaGoogle = user.app_metadata?.provider === "google" || providers.includes("google");
  if (!user.email_confirmed_at || !viaGoogle) {
    return NextResponse.json({ error: "not_admin" }, { status: 403 });
  }

  const secret = getJwtSecret();
  if (!secret) {
    console.error("[admin google-login] JWT_SECRET 未設定或長度不足，拒絕簽發 token");
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }
  const token = await new SignJWT({ email: user.email, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret);

  await auditAdminLogin(supabaseAdmin, { actor: user.email, method: "google", req, success: true });
  return NextResponse.json({ ok: true, token });
}
