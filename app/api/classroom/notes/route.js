import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { hasCourseAccess } from "@/lib/course-access";
import { sortNotes } from "@/lib/notes-format";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BODY_MAX = 2000;

function getUserClient(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

// 驗身分＋購課；回 { user, supabase } 或 { res }（錯誤回應）
async function gate(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return { res: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  const { data: { user }, error: authErr } = await getUserClient(token).auth.getUser();
  if (authErr || !user) return { res: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  const supabase = getSupabaseAdmin();
  if (!supabase) return { res: NextResponse.json({ error: "db_not_configured" }, { status: 503 }) };
  if (!(await hasCourseAccess(supabase, user.email))) {
    return { res: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { user, supabase };
}

export async function GET(req) {
  const g = await gate(req);
  if (g.res) return g.res;
  const raw = new URL(req.url).searchParams.get("video_id");
  const videoId = raw && UUID_RE.test(raw) ? raw : null;
  if (!videoId) return NextResponse.json({ notes: [] });

  const { data, error } = await g.supabase
    .from("notes")
    .select("id, seconds, body, created_at")
    .eq("user_id", g.user.id)
    .eq("video_id", videoId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notes: sortNotes(data || []) });
}

export async function POST(req) {
  const g = await gate(req);
  if (g.res) return g.res;
  const body = await req.json().catch(() => ({}));
  const videoId = (body.video_id || "").toString();
  const text = (body.body || "").toString().trim();
  const seconds = Math.max(0, Math.floor(Number(body.seconds) || 0));
  if (!UUID_RE.test(videoId)) return NextResponse.json({ error: "bad_video" }, { status: 400 });
  if (!text) return NextResponse.json({ error: "no_body" }, { status: 400 });

  const { data, error } = await g.supabase
    .from("notes")
    .insert({ user_id: g.user.id, video_id: videoId, seconds, body: text.slice(0, BODY_MAX) })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data?.id });
}

export async function DELETE(req) {
  const g = await gate(req);
  if (g.res) return g.res;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "no_id" }, { status: 400 });
  // 同時限縮 user_id：只能刪本人筆記
  const { error } = await g.supabase.from("notes").delete().eq("id", id).eq("user_id", g.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
