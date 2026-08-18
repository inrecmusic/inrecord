import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { requireClassroomAuth } from "@/lib/classroom-auth";
import { sortNotes } from "@/lib/notes-format";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BODY_MAX = 2000;

export async function GET(req) {
  const g = await requireClassroomAuth(req);
  if (g.res) return g.res;
  const raw = new URL(req.url).searchParams.get("video_id");
  const videoId = raw && UUID_RE.test(raw) ? raw : null;
  if (!videoId) return NextResponse.json({ notes: [] });

  const { data, error } = await g.supabase
    .from("notes")
    .select("id, seconds, body, created_at")
    .eq("user_id", g.user.id)
    .eq("video_id", videoId);
  if (error) return serverError(error);
  return NextResponse.json({ notes: sortNotes(data || []) });
}

export async function POST(req) {
  const g = await requireClassroomAuth(req);
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
  if (error) return serverError(error);
  return NextResponse.json({ ok: true, id: data?.id });
}

export async function DELETE(req) {
  const g = await requireClassroomAuth(req);
  if (g.res) return g.res;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "no_id" }, { status: 400 });
  // 同時限縮 user_id：只能刪本人筆記
  const { error } = await g.supabase.from("notes").delete().eq("id", id).eq("user_id", g.user.id);
  if (error) return serverError(error);
  return NextResponse.json({ ok: true });
}
