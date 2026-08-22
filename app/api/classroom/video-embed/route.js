import { NextResponse } from "next/server";
import { requireClassroomAuth } from "@/lib/classroom-auth";
import { signBunnyEmbedUrl } from "@/lib/bunny";

// 簽發課程影片 embed URL：驗登入 + 已購買後，回傳帶 token 的 Bunny 安全 URL。
// 授權統一走 requireClassroomAuth（requireCourse:true）：等同原本「登入 + 查 piano-101 enrollment」。
export async function GET(req) {
  const g = await requireClassroomAuth(req, { requireCourse: true });
  if (g.res) return g.res;
  const { supabase } = g;

  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("video_id");
  if (!videoId) return NextResponse.json({ error: "missing_video_id" }, { status: 400 });

  const { data: video } = await supabase
    .from("videos")
    .select("bunny_video_id, vimeo_id")
    .eq("id", videoId)
    .eq("published", true) // 只簽發已發布影片，擋已購課者猜 UUID 取未發布草稿的簽名網址
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
