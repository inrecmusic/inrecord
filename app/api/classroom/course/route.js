import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { requireClassroomAuth } from "@/lib/classroom-auth";
import { enforceDeviceLimit } from "@/lib/game-devices";

export async function GET(req) {
  const g = await requireClassroomAuth(req, { requireCourse: true });
  if (g.res) return g.res;
  // g.supabase 是 admin(service-role) client，bypass RLS 撈 chapters/videos
  const admin = g.supabase;

  // 裝置數上限（擠最舊）：購課驗證通過後、回課程內容前檢查
  const { searchParams } = new URL(req.url);
  const deviceId = searchParams.get("device_id");
  if (!deviceId) return NextResponse.json({ error: "device_required" }, { status: 400 });
  const ua = req.headers.get("user-agent") || null;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const dev = await enforceDeviceLimit(admin, { userId: g.user.id, deviceId, ua, ip });
  if (dev.error) return NextResponse.json({ error: dev.error }, { status: dev.status });

  const [chapRes, vidRes] = await Promise.all([
    admin.from("chapters").select("*").order("sort_order", { ascending: true }),
    admin
      .from("videos")
      .select("*")
      .eq("published", true)
      .order("sort_order", { ascending: true }),
  ]);

  if (chapRes.error) return serverError(chapRes.error);
  if (vidRes.error) return serverError(vidRes.error);

  return NextResponse.json({ ok: true, chapters: chapRes.data, videos: vidRes.data });
}
