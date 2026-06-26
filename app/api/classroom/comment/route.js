import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { hasCourseAccess } from "@/lib/course-access";

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

  // 須已購課才能留言（避免未購課帳號灌留言）
  if (!(await hasCourseAccess(getSupabaseAdmin(), user.email)))
    return NextResponse.json({ error: "not_purchased" }, { status: 403 });

  const { video_id, chapter_id, content } = await req.json();
  const trimmed = content?.trim();
  if (!trimmed) return NextResponse.json({ error: "content_required" }, { status: 400 });
  if (trimmed.length > 2000) return NextResponse.json({ error: "content_too_long" }, { status: 400 });

  const { data, error } = await db.from("comments").insert({
    user_id: user.id,
    video_id,
    chapter_id,
    user_email: user.email,
    user_name: user.user_metadata?.full_name || user.email?.split("@")[0],
    content: trimmed,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}
