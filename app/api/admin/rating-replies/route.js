import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { verifyAdminToken } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 500 });
  const { rating_id, admin_content } = await req.json();
  const { data, error } = await db.from("rating_replies").insert({ rating_id, admin_content }).select().single();
  if (error) return serverError(error);
  // Mark rating as replied
  await db.from("ratings").update({ status: "replied" }).eq("id", rating_id);
  return NextResponse.json({ ok: true, data });
}
