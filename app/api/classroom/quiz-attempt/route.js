import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { hasCourseAccess } from "@/lib/course-access";
import { gradeQuiz } from "@/lib/quiz";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function getUserClient(token) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } });
}

export async function POST(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: { user }, error: authErr } = await getUserClient(token).auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  if (!(await hasCourseAccess(supabase, user.email))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const quizId = (b.quiz_id || "").toString();
  if (!UUID_RE.test(quizId)) return NextResponse.json({ error: "bad_quiz" }, { status: 400 });
  const answers = Array.isArray(b.answers) ? b.answers.map(x => Math.round(Number(x))) : [];

  const { data: quiz } = await supabase.from("quizzes").select("id, pass_score, published").eq("id", quizId).maybeSingle();
  if (!quiz || !quiz.published) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: questions } = await supabase.from("quiz_questions")
    .select("id, correct_index, sort_order").eq("quiz_id", quizId).order("sort_order", { ascending: true });

  const { score, passed, correct } = gradeQuiz(questions || [], answers, quiz.pass_score);

  const { error: insErr } = await supabase.from("quiz_attempts").insert({ user_id: user.id, quiz_id: quizId, score, passed, answers });
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  return NextResponse.json({ score, passed, correct });
}
