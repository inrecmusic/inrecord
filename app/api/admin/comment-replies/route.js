import { NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 500 });
  const { comment_id, admin_content } = await req.json();
  const { data, error } = await db.from("comment_replies").insert({ comment_id, admin_content }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Mark comment as replied
  await db.from("comments").update({ status: "replied" }).eq("id", comment_id);
  return NextResponse.json({ ok: true, data });
}
