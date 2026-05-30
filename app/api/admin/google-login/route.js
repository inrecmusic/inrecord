import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { getSupabaseAdmin } from "@/lib/supabase";

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

  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({ email: user.email, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret);

  return NextResponse.json({ ok: true, token });
}
