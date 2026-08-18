import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
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
  if (error) return serverError(error);
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
  // 新建測驗此刻還沒有任何題目，一律以未發布建立；加完題目後再用 PATCH 發布（發布時會驗題數）。
  const row = { chapter_id, title, pass_score, published: false };
  const { data, error } = await supabase.from("quizzes").insert(row).select("id").single();
  if (error) return serverError(error);
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
  // 發布前確認至少有一題：0 題的已發布測驗永遠 passed=false，會讓全體學員完課證書卡在「尚未完成」。
  if (allowed.published === true) {
    const { count, error: cErr } = await supabase.from("quiz_questions")
      .select("id", { count: "exact", head: true }).eq("quiz_id", id);
    if (cErr) return serverError(cErr);
    if (!count) return NextResponse.json({ error: "no_questions" }, { status: 409 });
  }
  const { error } = await supabase.from("quizzes").update(allowed).eq("id", id);
  if (error) return serverError(error);
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
  if (error) return serverError(error);
  await logAudit(supabase, { actor: payload.email, action: "quiz.delete", targetType: "quiz", targetId: id, meta: {}, req });
  return NextResponse.json({ ok: true });
}
