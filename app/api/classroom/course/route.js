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

export async function GET(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await getUserClient(token).auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Use admin client to bypass RLS on chapters/videos
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const [chapRes, vidRes] = await Promise.all([
    admin.from("chapters").select("*").order("sort_order", { ascending: true }),
    admin
      .from("videos")
      .select("*")
      .eq("published", true)
      .order("sort_order", { ascending: true }),
  ]);

  if (chapRes.error) return NextResponse.json({ error: chapRes.error.message }, { status: 500 });
  if (vidRes.error) return NextResponse.json({ error: vidRes.error.message }, { status: 500 });

  return NextResponse.json({ ok: true, chapters: chapRes.data, videos: vidRes.data });
}
