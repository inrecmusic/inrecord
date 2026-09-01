import { NextResponse } from "next/server";
import { requireClassroomAuth } from "@/lib/classroom-auth";
import { signBunnyEmbedUrl } from "@/lib/bunny";
import { resolveEarlyAccess } from "@/lib/early-access-server";
import { isTrialVideo, FULL_RELEASE_MS } from "@/lib/early-access";

// 簽發課程影片 embed URL：驗登入 + 已購買後，回傳帶 token 的 Bunny 安全 URL。
// 授權統一走 requireClassroomAuth（requireCourse:true）：等同原本「登入 + 查 piano-101 enrollment」。
export async function GET(req) {
  const g = await requireClassroomAuth(req, { requireCourse: true });
  if (g.res) return g.res;
  const { supabase, user } = g;

  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("video_id");
  if (!videoId) return NextResponse.json({ error: "missing_video_id" }, { status: 400 });

  const { data: video } = await supabase
    .from("videos")
    .select("title, bunny_video_id, vimeo_id")
    .eq("id", videoId)
    .eq("published", true) // 只簽發已發布影片，擋已購課者猜 UUID 取未發布草稿的簽名網址
    .maybeSingle();
  if (!video) return NextResponse.json({ error: "video_not_found" }, { status: 404 });

  // 早鳥搶先看分層：9/30 前非早鳥不簽發正課影片（試看單元不限）。
  // bootstrap 已在 UI 層摘掉可播欄位，這裡是防「直接打 API 帶單元 id」繞過的硬性閘門。
  // fail-closed：resolveEarlyAccess 查詢故障時回 early=false，寧可暫時擋住也不讓硬閘門失效。
  if (Date.now() < FULL_RELEASE_MS && !isTrialVideo(video)) {
    const { early } = await resolveEarlyAccess(supabase, user.email);
    if (!early) return NextResponse.json({ error: "not_released" }, { status: 403 });
  }

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
