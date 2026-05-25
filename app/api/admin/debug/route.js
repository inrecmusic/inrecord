import { NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getSupabaseAdmin();

  // Check specific columns exist via select
  const colChecks = {};
  for (const col of ["id","title","vimeo_id","bunny_video_id","duration","duration_sec","assignment_desc","assignment_due","sort_order","published","chapter_id"]) {
    const { error } = await db.from("videos").select(col).limit(1);
    colChecks[col] = error ? `NO:${error.message.slice(0,40)}` : "YES";
  }

  return NextResponse.json({
    project: process.env.NEXT_PUBLIC_SUPABASE_URL?.replace("https://", "").split(".")[0],
    columns: colChecks,
  });
}
