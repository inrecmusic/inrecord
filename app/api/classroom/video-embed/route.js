import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { signBunnyEmbedUrl } from "@/lib/bunny";

function getUserClient(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

// 簽發課程影片 embed URL：驗登入 + 已購買後，回傳帶 token 的 Bunny 安全 URL。
export async function GET(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await getUserClient(token).auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  // 伺服器端購買驗證（補上 embed 原本缺的權限把關）
  const { data: enroll } = await supabase
    .from("enrollments")
    .select("id")
    .eq("email", user.email)
    .eq("course_id", "piano-101")
    .maybeSingle();
  if (!enroll) return NextResponse.json({ error: "purchase_required" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("video_id");
  if (!videoId) return NextResponse.json({ error: "missing_video_id" }, { status: 400 });

  const { data: video } = await supabase
    .from("videos")
    .select("bunny_video_id, vimeo_id")
    .eq("id", videoId)
    .maybeSingle();
  if (!video) return NextResponse.json({ error: "video_not_found" }, { status: 404 });

  if (video.bunny_video_id) {
    const src = signBunnyEmbedUrl(video.bunny_video_id, {
      libraryId: process.env.NEXT_PUBLIC_BUNNY_LIBRARY_ID,
      tokenKey:  process.env.BUNNY_TOKEN_KEY,
      expiresInSec: 10800,
    });
    return NextResponse.json({ provider: "bunny", src });
  }
  if (video.vimeo_id) {
    return NextResponse.json({
      provider: "vimeo",
      src: `https://player.vimeo.com/video/${video.vimeo_id}?autoplay=0&title=0&byline=0&portrait=0`,
    });
  }
  return NextResponse.json({ error: "no_video_source" }, { status: 404 });
}
