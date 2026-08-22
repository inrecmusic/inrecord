import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { verifyAdminToken } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: true, data: [], total: 0 });
  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page") || 1);
  const perPage = Number(searchParams.get("per_page") || 20);
  const status = searchParams.get("status");
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  let q = db.from("ratings").select("*, rating_replies(admin_content,created_at)", { count: "exact" }).order("created_at", { ascending: false }).range(from, to);
  if (status && status !== "all") q = q.eq("status", status);
  const { data, error, count } = await q;
  if (error) return serverError(error);
  return NextResponse.json({ ok: true, data, total: count });
}

export async function PATCH(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 500 });
  const body = await req.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  const updates = {}; // 白名單：後台只切換 hidden（顯示/隱藏評價），防 mass-assignment
  if (body.hidden !== undefined) updates.hidden = !!body.hidden;
  const { data, error } = await db.from("ratings").update(updates).eq("id", id).select().single();
  if (error) return serverError(error);
  return NextResponse.json({ ok: true, data });
}
