import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { requireClassroomAuth } from "@/lib/classroom-auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req) {
  const g = await requireClassroomAuth(req);
  if (g.res) return g.res;
  const raw = new URL(req.url).searchParams.get("chapter_id");
  const chapterId = raw && UUID_RE.test(raw) ? raw : null;
  if (!chapterId) return NextResponse.json({ quizzes: [] });

  const { data: quizzes, error } = await g.supabase.from("quizzes")
    .select("id, title, pass_score").eq("chapter_id", chapterId).eq("published", true)
    .order("sort_order", { ascending: true });
  if (error) return serverError(error);

  const ids = (quizzes || []).map(q => q.id);
  let bestByQuiz = {};
  if (ids.length) {
    const { data: attempts } = await g.supabase.from("quiz_attempts")
      .select("quiz_id, score, passed").eq("user_id", g.user.id).in("quiz_id", ids);
    for (const a of attempts || []) {
      const cur = bestByQuiz[a.quiz_id];
      if (!cur || a.score > cur.best_score) bestByQuiz[a.quiz_id] = { best_score: a.score, passed: a.passed || (cur?.passed ?? false) };
      if (a.passed && bestByQuiz[a.quiz_id]) bestByQuiz[a.quiz_id].passed = true;
    }
  }
  const out = (quizzes || []).map(q => ({ id: q.id, title: q.title, pass_score: q.pass_score, best_score: bestByQuiz[q.id]?.best_score ?? null, passed: bestByQuiz[q.id]?.passed ?? false }));
  return NextResponse.json({ quizzes: out });
}
