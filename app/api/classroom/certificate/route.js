import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { requireClassroomAuth } from "@/lib/classroom-auth";
import { certificateStatus } from "@/lib/certificate";
import { generateCode } from "@/lib/serial-codes";

const COURSE_TITLE = "從零開始學鋼琴";

export async function GET(req) {
  const g = await requireClassroomAuth(req);
  if (g.res) return g.res;
  const { user, supabase } = g;

  const name = user.user_metadata?.full_name || user.email?.split("@")[0] || "學員";

  // 已發證 → 一律直接回傳，證書一經取得永久可讀；不再重算資格，避免管理員日後新增
  // 影片/測驗使 eligible 翻 false 而讓既有證書變成看不到（且省去重訪必觸發的 23505）。
  const { data: existing, error: exErr } = await supabase
    .from("certificates").select("cert_code, issued_at").eq("user_id", user.id).maybeSingle();
  if (exErr) return serverError(exErr);
  if (existing) {
    return NextResponse.json({
      eligible: true, name, courseTitle: COURSE_TITLE,
      issuedAt: existing.issued_at, certCode: existing.cert_code,
    });
  }

  const [pv, cv, pq, pa] = await Promise.all([
    supabase.from("videos").select("id").eq("published", true),
    supabase.from("progress").select("video_id").eq("user_id", user.id).eq("completed", true),
    supabase.from("quizzes").select("id").eq("published", true),
    supabase.from("quiz_attempts").select("quiz_id").eq("user_id", user.id).eq("passed", true),
  ]);

  for (const r of [pv, cv, pq, pa]) {
    if (r.error) return serverError(r.error);
  }

  const status = certificateStatus({
    publishedVideoIds: (pv.data || []).map((r) => r.id),
    completedVideoIds: (cv.data || []).map((r) => r.video_id),
    publishedQuizIds: (pq.data || []).map((r) => r.id),
    passedQuizIds: (pa.data || []).map((r) => r.quiz_id),
  });

  if (!status.eligible) {
    return NextResponse.json({
      eligible: false,
      videoDone: status.videoDone, videoTotal: status.videoTotal,
      quizDone: status.quizDone, quizTotal: status.quizTotal,
    });
  }

  // 冪等發證：insert 容忍 23505（已有一張）→ 再 select 既有 row 取穩定 cert_code/issued_at。
  // cert_code 用共用 lib/serial-codes 的 generateCode（"INREC-"+8 碼、CSPRNG、排除易混字）。
  const { error: insErr } = await supabase
    .from("certificates")
    .insert({ user_id: user.id, email: user.email, cert_code: generateCode("INREC") });
  if (insErr && insErr.code !== "23505") {
    return serverError(insErr);
  }
  const { data: cert, error: certErr } = await supabase
    .from("certificates")
    .select("cert_code, issued_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (certErr || !cert) return NextResponse.json({ error: "cert_issue_failed" }, { status: 500 });

  return NextResponse.json({
    eligible: true,
    name,
    courseTitle: COURSE_TITLE,
    issuedAt: cert.issued_at,
    certCode: cert.cert_code,
  });
}
