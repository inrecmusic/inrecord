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
  const w = Math.floor(Number(watched_seconds) || 0);
  const t = Math.floor(Number(total_seconds) || 0);
  const c = !!completed;

  // 原子更新：RPC 內以 GREATEST(watched/total) + (completed OR …) 合併，
  // 避免並發（多分頁/快速心跳）的 read-modify-write 互相覆蓋而遺失進度。
  const rpc = await admin.rpc("upsert_progress", {
    p_user_id: user.id, p_video_id: video_id, p_watched: w, p_total: t, p_completed: c,
  });
  if (!rpc.error) {
    const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
    return NextResponse.json({ ok: true, data: row });
  }

  // 後備：RPC 尚未部署（supabase-deploy.sql）時，退回非原子 read-modify-write，確保進度仍可記錄。
  console.error("[progress] rpc upsert_progress 失敗，退回 read-modify-write:", rpc.error.message);
  const { data: existing } = await admin
    .from("progress")
    .select("watched_seconds, completed")
    .eq("user_id", user.id)
    .eq("video_id", video_id)
    .maybeSingle();

  const { data, error } = await admin
    .from("progress")
    .upsert({
      user_id: user.id,
      video_id,
      watched_seconds: Math.max(w, existing?.watched_seconds || 0),
      total_seconds: t,
      completed: existing?.completed || c,
      watched_at: new Date().toISOString(),
    }, { onConflict: "user_id,video_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}
