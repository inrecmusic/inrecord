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
  if (!admin) return NextResponse.json({ ok: true, data: [] });

  const { data, error } = await admin
    .from("progress")
    .select("video_id, completed, watched_at")
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function POST(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const user = await getUser(token);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const { video_id, completed } = await req.json();
  if (!video_id) return NextResponse.json({ error: "video_id_required" }, { status: 400 });

  const { data, error } = await admin
    .from("progress")
    .upsert(
      {
        user_id: user.id,
        video_id,
        watched_at: new Date().toISOString(),
        ...(completed !== undefined && { completed }),
      },
      { onConflict: "user_id,video_id" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}
