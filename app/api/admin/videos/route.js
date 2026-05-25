import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";

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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getClient();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 500 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const { error } = await supabase.from("videos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
