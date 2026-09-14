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

async function getUser(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return {};
  const db = getUserClient(token);
  const { data: { user }, error } = await db.auth.getUser();
  return error || !user ? {} : { user, db };
}

export async function POST(req) {
  const { user } = await getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 須已購課才能繳交作業
  const admin = getSupabaseAdmin();
  if (!(await hasCourseAccess(admin, user.email)))
    return NextResponse.json({ error: "not_purchased" }, { status: 403 });

  const { video_id, file_name, file_url } = await req.json();
  if (!video_id || !file_url) return NextResponse.json({ error: "missing_fields" }, { status: 400 });

  // file_url 必須是 https 且指向本專案 Supabase storage：擋 javascript:/data:/外部釣魚連結
  // （後台批改頁會把它當連結渲染，未驗證＝stored-link 注入）。
  let validUrl = false;
  try {
    const u = new URL(String(file_url));
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host : "";
    validUrl = u.protocol === "https:" && !!base && u.host === base;
  } catch {}
  if (!validUrl) return NextResponse.json({ error: "invalid_file_url" }, { status: 400 });

  const { data, error } = await admin.from("submissions").insert({
    user_id: user.id,
    video_id,
    file_name: file_name || "檔案",
    file_url,
    user_email: user.email,
  }).select().single();

  if (error) return serverError(error);
  return NextResponse.json({ ok: true, data });
}
