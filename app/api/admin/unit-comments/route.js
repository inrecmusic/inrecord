import { NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: true, data: [], total: 0, unread: 0 });
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const video_id = searchParams.get("video_id");
  const page = Number(searchParams.get("page") || 1);
  const perPage = Number(searchParams.get("per_page") || 20);
  const countOnly = searchParams.get("count") === "true";

  if (countOnly) {
    const { count } = await db.from("comments").select("*", { count: "exact", head: true }).eq("status", "pending");
    return NextResponse.json({ ok: true, unread: count || 0 });
  }

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  let q = db.from("comments").select("*, videos(title, chapter_id)", { count: "exact" }).order("created_at", { ascending: false }).range(from, to);
  if (status && status !== "all") q = q.eq("status", status);
  if (video_id && video_id !== "all") q = q.eq("video_id", video_id);
  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data, total: count });
}

export async function DELETE(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 500 });
  const id = new URL(req.url).searchParams.get("id");
  const { error } = await db.from("comments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 500 });
  const { id, status } = await req.json();
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  const updates = {};
  if (status !== undefined) updates.status = status;
  if (!Object.keys(updates).length) return NextResponse.json({ error: "no_updates" }, { status: 400 });
  const { data, error } = await db.from("comments").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}
