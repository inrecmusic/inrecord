import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { logAudit } from "@/lib/audit";

// 刪單元前要檢查的學員資料表：video_id 皆為 ON DELETE CASCADE，刪了就一起消失且無法復原。
// （materials 是後台自己上傳的講義、games.video_id 是 SET NULL，非學員資料故不擋。）
const STUDENT_DATA_TABLES = ["progress", "submissions", "notes", "comments"];

function getClient() {
  return getSupabaseAdmin();
}

export async function GET(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getClient();
  if (!supabase) return NextResponse.json({ ok: true, data: [] });

  const chapter_id = new URL(req.url).searchParams.get("chapter_id");
  let query = supabase.from("videos").select("*").order("sort_order", { ascending: true });
  if (chapter_id) query = query.eq("chapter_id", chapter_id);

  const { data, error } = await query;
  if (error) return serverError(error);
  return NextResponse.json({ ok: true, data: data || [] });
}

export async function POST(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getClient();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 500 });

  const body = await req.json();
  const { data, error } = await supabase
    .from("videos")
    .insert({
      chapter_id:      body.chapter_id || null,
      title:           body.title || null,
      vimeo_id:        body.vimeo_id || null,
      bunny_video_id:  body.bunny_video_id || null,
      duration:        body.duration || null,
      sort_order:      body.sort_order ?? 0,
      published:       body.published ?? false,
      assignment_desc: body.assignment_desc || null,
      assignment_due:  body.assignment_due || null,
    })
    .select()
    .single();

  if (error) return serverError(error);
  return NextResponse.json({ ok: true, data });
}

export async function PATCH(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getClient();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 500 });

  const body = await req.json();
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const updateData = {};
  if (fields.chapter_id      !== undefined) updateData.chapter_id      = fields.chapter_id || null;
  if (fields.title           !== undefined) updateData.title           = fields.title || null;
  if (fields.vimeo_id        !== undefined) updateData.vimeo_id        = fields.vimeo_id || null;
  if (fields.bunny_video_id  !== undefined) updateData.bunny_video_id  = fields.bunny_video_id || null;
  if (fields.duration        !== undefined) updateData.duration        = fields.duration || null;
  if (fields.sort_order      !== undefined) updateData.sort_order      = fields.sort_order;
  if (fields.published       !== undefined) updateData.published       = fields.published;
  if (fields.assignment_desc !== undefined) updateData.assignment_desc = fields.assignment_desc || null;
  if (fields.assignment_due  !== undefined) updateData.assignment_due  = fields.assignment_due || null;

  const { error } = await supabase.from("videos").update(updateData).eq("id", id);
  if (error) return serverError(error);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getClient();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 500 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  // 防連鎖資料損失（與 chapters DELETE 的 quizzes 守衛同一原則）：只要有任一學員的
  // 進度/作業/筆記/留言掛在此單元就擋下（409＋各表筆數），請改「取消發布」而非刪除。
  const [{ data: video }, ...counts] = await Promise.all([
    supabase.from("videos").select("title, chapter_id").eq("id", id).maybeSingle(),
    ...STUDENT_DATA_TABLES.map((t) => supabase.from(t).select("*", { count: "exact", head: true }).eq("video_id", id)),
  ]);
  const failed = counts.find((c) => c.error);
  if (failed) return serverError(failed.error);
  const usage = Object.fromEntries(STUDENT_DATA_TABLES.map((t, i) => [t, counts[i].count || 0]));
  if (Object.values(usage).some((n) => n > 0)) {
    return NextResponse.json({ error: "video_has_student_data", usage }, { status: 409 });
  }

  const { error } = await supabase.from("videos").delete().eq("id", id);
  if (error) return serverError(error);
  await logAudit(supabase, {
    actor: payload.email, action: "video.delete", targetType: "video", targetId: id,
    meta: { title: video?.title ?? null, chapter_id: video?.chapter_id ?? null }, req,
  });
  return NextResponse.json({ ok: true });
}
