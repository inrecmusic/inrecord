import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
  const { user, db } = await getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const video_id = new URL(req.url).searchParams.get("video_id");
  let q = db.from("submissions").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
  if (video_id) q = q.eq("video_id", video_id);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}
