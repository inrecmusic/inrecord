import { NextResponse } from "next/server";
import { requireClassroomAuth } from "@/lib/classroom-auth";

export async function GET(req) {
  const g = await requireClassroomAuth(req, { requireCourse: true });
  if (g.res) return g.res;
  // g.supabase 是 admin(service-role) client，bypass RLS 撈 chapters/videos
  const admin = g.supabase;

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
