import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { logAudit } from "@/lib/audit";

// options 必為「≥2 個非空字串」的陣列；correct_index 必為 0..options.length-1 的整數
function validateQuestion({ question, options, correct_index }) {
  const text = (question || "").toString().trim();
  if (!text) return { error: "no_question" };
  if (!Array.isArray(options) || options.length < 2) return { error: "bad_options" };
  const opts = options.map(o => (o == null ? "" : String(o).trim()));
  if (opts.some(o => !o)) return { error: "empty_option" };
  const ci = Math.round(Number(correct_index));
  if (!Number.isInteger(ci) || ci < 0 || ci >= opts.length) return { error: "bad_correct" };
  return { ok: true, text, opts, ci };
}

export async function GET(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const quizId = new URL(req.url).searchParams.get("quiz_id");
  if (!quizId) return NextResponse.json({ error: "no_quiz_id" }, { status: 400 });
  const { data, error } = await supabase.from("quiz_questions")
    .select("id, quiz_id, question, options, correct_index, sort_order")
    .eq("quiz_id", quizId).order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ questions: data || [] });
}

export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const b = await req.json().catch(() => ({}));
  const quizId = (b.quiz_id || "").toString();
  if (!quizId) return NextResponse.json({ error: "no_quiz_id" }, { status: 400 });
  const v = validateQuestion(b);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const { data, error } = await supabase.from("quiz_questions")
    .insert({ quiz_id: quizId, question: v.text, options: v.opts, correct_index: v.ci, sort_order: Number.isFinite(b.sort_order) ? Math.round(b.sort_order) : 0 })
    .select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit(supabase, { actor: payload.email, action: "quiz_question.create", targetType: "quiz_question", targetId: data?.id, meta: { quiz_id: quizId }, req });
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
  // 若同時改 options/correct_index 需整組驗證；此處要求前端一次送齊 question/options/correct_index
  const v = validateQuestion(b);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const allowed = { question: v.text, options: v.opts, correct_index: v.ci };
  if (Number.isFinite(b.sort_order)) allowed.sort_order = Math.round(b.sort_order);
  const { error } = await supabase.from("quiz_questions").update(allowed).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit(supabase, { actor: payload.email, action: "quiz_question.update", targetType: "quiz_question", targetId: id, meta: { quiz_id: b.quiz_id }, req });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "no_id" }, { status: 400 });
  const { error } = await supabase.from("quiz_questions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit(supabase, { actor: payload.email, action: "quiz_question.delete", targetType: "quiz_question", targetId: id, meta: {}, req });
  return NextResponse.json({ ok: true });
}
