import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { hasCourseAccess } from "@/lib/course-access";
import { certificateStatus } from "@/lib/certificate";

const COURSE_TITLE = "從零開始學鋼琴";
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 排除易混字 0O1IL

function makeCertCode() {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `INREC-${s}`;
}

function getUserClient(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

export async function GET(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: { user }, error: authErr } = await getUserClient(token).auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  if (!(await hasCourseAccess(supabase, user.email))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const name = user.user_metadata?.full_name || user.email?.split("@")[0] || "學員";

  // 已發證 → 一律直接回傳，證書一經取得永久可讀；不再重算資格，避免管理員日後新增
  // 影片/測驗使 eligible 翻 false 而讓既有證書變成看不到（且省去重訪必觸發的 23505）。
  const { data: existing, error: exErr } = await supabase
    .from("certificates").select("cert_code, issued_at").eq("user_id", user.id).maybeSingle();
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
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
    if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
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
  const { error: insErr } = await supabase
    .from("certificates")
    .insert({ user_id: user.id, email: user.email, cert_code: makeCertCode() });
  if (insErr && insErr.code !== "23505") {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
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
