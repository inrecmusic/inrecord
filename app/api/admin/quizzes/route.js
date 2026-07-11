import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { logAudit } from "@/lib/audit";

export async function GET(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const chapterId = new URL(req.url).searchParams.get("chapter_id");
  let q = supabase.from("quizzes")
    .select("id, chapter_id, title, pass_score, published, sort_order, created_at")
    .order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  if (chapterId) q = q.eq("chapter_id", chapterId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ quizzes: data || [] });
}

export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const b = await req.json().catch(() => ({}));
  const chapter_id = (b.chapter_id || "").toString() || null;
  const title = (b.title || "").toString().trim();
  if (!title) return NextResponse.json({ error: "no_title" }, { status: 400 });
  const pass_score = Number.isFinite(b.pass_score) ? Math.min(100, Math.max(0, Math.round(b.pass_score))) : 80;
  const row = { chapter_id, title, pass_score, published: b.published === true };
  const { data, error } = await supabase.from("quizzes").insert(row).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit(supabase, { actor: payload.email, action: "quiz.create", targetType: "quiz", targetId: data?.id, meta: { title, chapter_id }, req });
  return NextResponse.json({ ok: true, id: data?.id });
}

export async function PATCH(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const b = await req.json().catch(() => ({}));
  const id = (b.id || "").toString();
  if (!id) return NextResponse.json({ error: "no_id" }, { status: 400 });
  const allowed = {};
  if (typeof b.title === "string") allowed.title = b.title.trim();
  if (Number.isFinite(b.pass_score)) allowed.pass_score = Math.min(100, Math.max(0, Math.round(b.pass_score)));
  if (typeof b.published === "boolean") allowed.published = b.published;
  if (Number.isFinite(b.sort_order)) allowed.sort_order = Math.round(b.sort_order);
  if (Object.keys(allowed).length === 0) return NextResponse.json({ error: "no_fields" }, { status: 400 });
  const { error } = await supabase.from("quizzes").update(allowed).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit(supabase, { actor: payload.email, action: "quiz.update", targetType: "quiz", targetId: id, meta: allowed, req });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "no_id" }, { status: 400 });
  const { error } = await supabase.from("quizzes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit(supabase, { actor: payload.email, action: "quiz.delete", targetType: "quiz", targetId: id, meta: {}, req });
  return NextResponse.json({ ok: true });
}
