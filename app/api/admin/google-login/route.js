import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getJwtSecret } from "@/lib/adminAuth";

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

  return NextResponse.json({ ok: true, token });
}
