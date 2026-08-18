import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { verifyAdminToken } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: true, data: [] });
  const { data, error } = await db.from("chapters").select("*").order("sort_order", { ascending: true });
  if (error) return serverError(error);
  return NextResponse.json({ ok: true, data });
}

export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 500 });
  const { title, sort_order } = await req.json();
  const { data, error } = await db.from("chapters").insert({ title, sort_order }).select().single();
  if (error) return serverError(error);
  return NextResponse.json({ ok: true, data });
}

export async function PATCH(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 500 });
  const { id, ...updates } = await req.json();
  const { data, error } = await db.from("chapters").update(updates).eq("id", id).select().single();
  if (error) return serverError(error);
  return NextResponse.json({ ok: true, data });
}

export async function DELETE(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 500 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "no_id" }, { status: 400 });
  // 防連鎖資料損失：quizzes.chapter_id 是 ON DELETE CASCADE，刪章節會把該章節下的測驗
  // 題目與「全體學員作答/通過紀錄(quiz_attempts)」一起級聯刪除且無法復原。有測驗綁在此
  // 章節就擋下，要求先改綁或刪除測驗。（videos.chapter_id 是 SET NULL，非破壞性故不擋。）
  const { count: quizCount, error: qcErr } = await db
    .from("quizzes").select("id", { count: "exact", head: true }).eq("chapter_id", id);
  if (qcErr) return serverError(qcErr);
  if (quizCount > 0) return NextResponse.json({ error: "chapter_has_quizzes" }, { status: 409 });
  const { error } = await db.from("chapters").delete().eq("id", id);
  if (error) return serverError(error);
  return NextResponse.json({ ok: true });
}
