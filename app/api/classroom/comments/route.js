import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { createClient } from "@supabase/supabase-js";
import { COMMENT_LIST_SELECT, toPublicComment } from "@/lib/comments";
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

async function getUser(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return {};
  const db = getUserClient(token);
  const { data: { user }, error } = await db.auth.getUser();
  return error || !user ? {} : { user, db };
}

export async function GET(req) {
  const { user } = await getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // 須已購課才能讀討論（與 POST 一致；擋非購課者讀留言內容）
  const admin = getSupabaseAdmin();
  if (!(await hasCourseAccess(admin, user.email))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const video_id = new URL(req.url).searchParams.get("video_id");
  let q = admin
    .from("comments")
    .select(COMMENT_LIST_SELECT)
    .order("created_at", { ascending: false });
  if (video_id) q = q.eq("video_id", video_id);
  const { data, error } = await q;
  if (error) return serverError(error);
  return NextResponse.json({ ok: true, data: (data || []).map(toPublicComment) });
}
