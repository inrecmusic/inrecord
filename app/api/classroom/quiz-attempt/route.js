import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { requireClassroomAuth } from "@/lib/classroom-auth";
import { gradeQuiz } from "@/lib/quiz";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req) {
  const g = await requireClassroomAuth(req);
  if (g.res) return g.res;
  const { user, supabase } = g;

  const b = await req.json().catch(() => ({}));
  const quizId = (b.quiz_id || "").toString();
  if (!UUID_RE.test(quizId)) return NextResponse.json({ error: "bad_quiz" }, { status: 400 });
  // 只接受整數選項索引；null/""/非整數（含 Number(null)===0 陷阱）一律視為「未作答」= -1
  const toIndex = (x) => { const n = Number(x); return x === null || x === "" || !Number.isInteger(n) ? -1 : n; };
  const answers = Array.isArray(b.answers) ? b.answers.map(toIndex) : [];

  const { data: quiz } = await supabase.from("quizzes").select("id, pass_score, published").eq("id", quizId).maybeSingle();
  if (!quiz || !quiz.published) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // 加 id 次要排序鍵，確保與取題端點(quiz/route.js)順序一致（sort_order 撞號時位置式計分才不會對錯題）
  const { data: questions, error: qErr } = await supabase.from("quiz_questions")
    .select("id, correct_index, sort_order").eq("quiz_id", quizId)
    .order("sort_order", { ascending: true }).order("id", { ascending: true });
  // DB 錯誤不可當成「0 題」照樣計 0 分並寫入永久 attempt（比照 certificate/notes 路由）
  if (qErr) return serverError(qErr);

  const { score, passed, results } = gradeQuiz(questions || [], answers, quiz.pass_score);

  const { error: insErr } = await supabase.from("quiz_attempts").insert({ user_id: user.id, quiz_id: quizId, score, passed, answers });
  if (insErr) return serverError(insErr);
  return NextResponse.json({ score, passed, results });
}
