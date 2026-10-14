import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { requireClassroomAuth } from "@/lib/classroom-auth";
import { planRatingEdit } from "@/lib/rating-edit";

// 資料表讀寫一律走 service role；使用者身分由 Supabase JWT 驗證、購課由 hasCourseAccess 把關（requireClassroomAuth）。
// 這樣 comments／ratings／submissions 對 authenticated 的 RLS policy 就能收掉（supabase-classroom-rls-tighten.sql），
// 自助註冊的帳號再也不能拿 anon key＋JWT 繞過 API 直讀留言者 email、灌評價、塞作業。

const OWN_COLS = "id, score, content, created_at";

// 第一次評分。須已購課（評分會進首頁平均分統計，避免未購課者灌分）。
// 前端「點星即存」只帶 score；心得之後用 PATCH 補。
export async function POST(req) {
  const g = await requireClassroomAuth(req);
  if (g.res) return g.res;
  const { user, supabase } = g;

  const { data: existing } = await supabase.from("ratings").select("id").eq("user_id", user.id).limit(1);
  if (existing?.length) return NextResponse.json({ error: "already_rated" }, { status: 409 });

  const { score, content } = await req.json().catch(() => ({}));
  if (!score || !Number.isInteger(score) || score < 1 || score > 5) {
    return NextResponse.json({ error: "invalid_score" }, { status: 400 });
  }
  const trimmedContent = content?.trim() || null;
  if (trimmedContent && trimmedContent.length > 1000) {
    return NextResponse.json({ error: "content_too_long" }, { status: 400 });
  }

  const { data, error } = await supabase.from("ratings").insert({
    user_id: user.id,
    course_id: "main",
    score,
    content: trimmedContent,
    user_email: user.email,
    user_name: user.user_metadata?.full_name || user.email?.split("@")[0],
  }).select(OWN_COLS).single();

  if (error) {
    // 唯一索引 ratings_user_unique 兜底：先查後插仍可能並發 → 第二筆撞 23505 視為已評分
    if (error.code === "23505") return NextResponse.json({ error: "already_rated" }, { status: 409 });
    return serverError(error);
  }
  return NextResponse.json({ ok: true, data });
}

// 修改自己的評價：補寫心得、或剛送出時改星數。能不能改由 lib/rating-edit.js 決定。
export async function PATCH(req) {
  const g = await requireClassroomAuth(req);
  if (g.res) return g.res;
  const { user, supabase } = g;

  const { data: rows, error: readErr } = await supabase.from("ratings").select(OWN_COLS).eq("user_id", user.id).limit(1);
  if (readErr) return serverError(readErr);
  const existing = rows?.[0];
  if (!existing) return NextResponse.json({ error: "not_rated" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const plan = planRatingEdit(existing, { score: body.score, content: body.content });
  if (plan.error) {
    return NextResponse.json({ error: plan.error }, { status: plan.error === "edit_window_closed" ? 409 : 400 });
  }
  if (!plan.patch) return NextResponse.json({ ok: true, data: existing });

  const { data, error } = await supabase.from("ratings").update(plan.patch)
    .eq("id", existing.id).eq("user_id", user.id).select(OWN_COLS).single();
  if (error) return serverError(error);
  return NextResponse.json({ ok: true, data });
}
