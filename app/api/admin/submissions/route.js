import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { verifyAdminToken } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { selectAll } from "@/lib/supabase-paginate";

export async function GET(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: true, data: [] });
  const { searchParams } = new URL(req.url);

  // counts 模式：回各單元的繳交總筆數 { video_id: n }，供作業列表顯示（分頁繞過 1000 列上限）。
  if (searchParams.get("counts")) {
    try {
      const rows = await selectAll(db, "submissions", (q) => q.select("video_id"));
      const counts = {};
      for (const r of rows) counts[r.video_id] = (counts[r.video_id] || 0) + 1;
      return NextResponse.json({ ok: true, counts });
    } catch (e) { return serverError(e); }
  }

  const video_id = searchParams.get("video_id");
  let q = db.from("submissions").select("*").order("submitted_at", { ascending: false });
  if (video_id) q = q.eq("video_id", video_id);
  const { data, error } = await q;
  if (error) return serverError(error);
  return NextResponse.json({ ok: true, data });
}

export async function PATCH(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 500 });
  const { id, ...updates } = await req.json();
  const { data, error } = await db.from("submissions").update(updates).eq("id", id).select().single();
  if (error) return serverError(error);
  return NextResponse.json({ ok: true, data });
}
