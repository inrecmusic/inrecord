import { NextResponse } from "next/server";
import { requireClassroomAuth } from "@/lib/classroom-auth";
import { stripAnswers } from "@/lib/quiz";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req) {
  const g = await requireClassroomAuth(req);
  if (g.res) return g.res;
  const { supabase } = g;

  const raw = new URL(req.url).searchParams.get("id");
  const id = raw && UUID_RE.test(raw) ? raw : null;
  if (!id) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: quiz } = await supabase.from("quizzes")
    .select("id, title, pass_score, published").eq("id", id).maybeSingle();
  if (!quiz || !quiz.published) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: questions, error: qErr } = await supabase.from("quiz_questions")
    .select("id, question, options, sort_order").eq("quiz_id", id)
    .order("sort_order", { ascending: true }).order("id", { ascending: true });
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });

  return NextResponse.json({
    quiz: { id: quiz.id, title: quiz.title, pass_score: quiz.pass_score },
    questions: stripAnswers(questions || []).map(({ sort_order, ...rest }) => rest),
  });
}
