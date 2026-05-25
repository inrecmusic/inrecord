import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";

function getUserClient(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

async function getUser(token) {
  if (!token) return null;
  const { data: { user }, error } = await getUserClient(token).auth.getUser();
  return error || !user ? null : user;
}

export async function GET(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const user = await getUser(token);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: true, progress: [], completedCount: 0, totalCount: 0, percentage: 0 });

  const [progRes, countRes] = await Promise.all([
    admin
      .from("progress")
      .select("video_id, watched_seconds, total_seconds, completed, watched_at")
      .eq("user_id", user.id),
    admin
      .from("videos")
      .select("id", { count: "exact", head: true })
      .eq("published", true),
  ]);

  if (progRes.error) return NextResponse.json({ error: progRes.error.message }, { status: 500 });

  const progress = progRes.data || [];
  const completedCount = progress.filter(p => p.completed).length;
  const totalCount = countRes.count || 0;
  const percentage = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;

  return NextResponse.json({ ok: true, progress, completedCount, totalCount, percentage });
}

export async function POST(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const user = await getUser(token);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const { video_id, watched_seconds = 0, total_seconds = 0, completed = false } = await req.json();
  if (!video_id) return NextResponse.json({ error: "video_id_required" }, { status: 400 });

  const { data: existing } = await admin
    .from("progress")
    .select("watched_seconds, completed")
    .eq("user_id", user.id)
    .eq("video_id", video_id)
    .single();

  const { data, error } = await admin
    .from("progress")
    .upsert({
      user_id: user.id,
      video_id,
      watched_seconds: Math.max(watched_seconds, existing?.watched_seconds || 0),
      total_seconds,
      completed: existing?.completed || completed,
      watched_at: new Date().toISOString(),
    }, { onConflict: "user_id,video_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}
