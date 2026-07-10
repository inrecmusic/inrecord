import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { hasCourseAccess } from "@/lib/course-access";

const BUCKET = "course-materials";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  // video_id 需為合法 UUID 才採用（避免注入 PostgREST or() 過濾）
  const raw = new URL(req.url).searchParams.get("video_id");
  const videoId = raw && UUID_RE.test(raw) ? raw : null;

  // 該單元講義（若有 videoId）＋ 全課程通用講義（video_id IS NULL）
  let q = supabase
    .from("materials")
    .select("id, video_id, title, file_size, storage_path, sort_order")
    .order("sort_order", { ascending: true });
  q = videoId ? q.or(`video_id.eq.${videoId},video_id.is.null`) : q.is("video_id", null);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const materials = [];
  for (const m of data || []) {
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(m.storage_path, 300);
    materials.push({ id: m.id, title: m.title, file_size: m.file_size, video_id: m.video_id, url: signed?.signedUrl || null });
  }
  return NextResponse.json({ materials });
}
