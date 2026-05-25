import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

  // Check no existing rating
  const { data: existing } = await db.from("ratings").select("id").eq("user_id", user.id).limit(1);
  if (existing?.length) return NextResponse.json({ error: "already_rated" }, { status: 409 });

  const { score, content } = await req.json();
  if (!score || !Number.isInteger(score) || score < 1 || score > 5) {
    return NextResponse.json({ error: "invalid_score" }, { status: 400 });
  }
  const trimmedContent = content?.trim() || null;
  if (trimmedContent && trimmedContent.length > 1000) {
    return NextResponse.json({ error: "content_too_long" }, { status: 400 });
  }

  const { data, error } = await db.from("ratings").insert({
    user_id: user.id,
    course_id: "main",
    score,
    content: trimmedContent,
    user_email: user.email,
    user_name: user.user_metadata?.full_name || user.email?.split("@")[0],
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}
