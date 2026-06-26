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

async function getUser(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return {};
  const db = getUserClient(token);
  const { data: { user }, error } = await db.auth.getUser();
  return error || !user ? {} : { user, db };
}

export async function POST(req) {
  const { user, db } = await getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 須已購課才能繳交作業
  if (!(await hasCourseAccess(getSupabaseAdmin(), user.email)))
    return NextResponse.json({ error: "not_purchased" }, { status: 403 });

  const { video_id, file_name, file_url } = await req.json();
  if (!video_id || !file_url) return NextResponse.json({ error: "missing_fields" }, { status: 400 });

  const { data, error } = await db.from("submissions").insert({
    user_id: user.id,
    video_id,
    file_name: file_name || "檔案",
    file_url,
    user_email: user.email,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}
