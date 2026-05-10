import { NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/adminAuth";

export async function GET(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, email: payload.email });
}
