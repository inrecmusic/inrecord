import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { hasCourseAccess } from "@/lib/course-access";

// 資料表讀寫一律走 service role（getSupabaseAdmin）；使用者身分仍由 Supabase JWT 驗證、購課由 hasCourseAccess 把關。
// 這樣 comments／ratings／submissions 對 authenticated 的 RLS policy 就能收掉（supabase-classroom-rls-tighten.sql），
// 自助註冊的帳號再也不能拿 anon key＋JWT 繞過 API 直讀留言者 email、灌評價、塞作業。

function getUserClient(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

export async function POST(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getUserClient(token);
  const { data: { user }, error: authErr } = await db.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 須已購課才能評分（評分會進首頁平均分統計，避免未購課者灌分）
  const admin = getSupabaseAdmin();
  if (!(await hasCourseAccess(admin, user.email)))
    return NextResponse.json({ error: "not_purchased" }, { status: 403 });

  // Check no existing rating
  const { data: existing } = await admin.from("ratings").select("id").eq("user_id", user.id).limit(1);
  if (existing?.length) return NextResponse.json({ error: "already_rated" }, { status: 409 });

  const { score, content } = await req.json();
  if (!score || !Number.isInteger(score) || score < 1 || score > 5) {
    return NextResponse.json({ error: "invalid_score" }, { status: 400 });
  }
  const trimmedContent = content?.trim() || null;
  if (trimmedContent && trimmedContent.length > 1000) {
    return NextResponse.json({ error: "content_too_long" }, { status: 400 });
  }

  const { data, error } = await admin.from("ratings").insert({
    user_id: user.id,
    course_id: "main",
    score,
    content: trimmedContent,
    user_email: user.email,
    user_name: user.user_metadata?.full_name || user.email?.split("@")[0],
  }).select().single();

  if (error) {
    // 唯一索引 ratings_user_unique 兜底：先查後插仍可能並發 → 第二筆撞 23505 視為已評分
    if (error.code === "23505") return NextResponse.json({ error: "already_rated" }, { status: 409 });
    return serverError(error);
  }
  return NextResponse.json({ ok: true, data });
}
