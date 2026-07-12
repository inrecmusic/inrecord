import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { hasCourseAccess } from "@/lib/course-access";
import { stripAnswers } from "@/lib/quiz";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function getUserClient(token) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } });
}

export async function GET(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: { user }, error: authErr } = await getUserClient(token).auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  if (!(await hasCourseAccess(supabase, user.email))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

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
