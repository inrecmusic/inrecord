import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { validateMaterialFile } from "@/lib/material-file";
import { logAudit } from "@/lib/audit";

const BUCKET = "course-materials";

export async function GET(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const videoId = new URL(req.url).searchParams.get("video_id");
  let q = supabase
    .from("materials")
    .select("id, video_id, title, storage_path, file_size, sort_order, created_at")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  q = videoId ? q.eq("video_id", videoId) : q.is("video_id", null);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ materials: data || [] });
}

export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const formData = await req.formData();
  const file = formData.get("file");
  const title = (formData.get("title") || "").toString().trim();
  const videoId = (formData.get("video_id") || "").toString().trim() || null;

  if (!file || typeof file === "string") return NextResponse.json({ error: "no_file" }, { status: 400 });
  if (!title) return NextResponse.json({ error: "no_title" }, { status: 400 });

  const buf = new Uint8Array(await file.arrayBuffer());
  const v = validateMaterialFile(buf, file.type);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const path = `materials/${randomUUID()}.${v.ext}`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, buf, { contentType: "application/pdf", upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data, error } = await supabase
    .from("materials")
    .insert({ video_id: videoId, title, storage_path: path, file_size: buf.length })
    .select("id")
    .single();
  if (error) {
    // 入庫失敗 → 清掉剛上傳的孤兒檔
    await supabase.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit(supabase, {
    actor: payload.email, action: "material.create", targetType: "material",
    targetId: data?.id, meta: { title, video_id: videoId }, req,
  });
  return NextResponse.json({ ok: true, id: data?.id });
}

export async function DELETE(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "no_id" }, { status: 400 });

  const { data: row } = await supabase.from("materials").select("storage_path").eq("id", id).maybeSingle();
  if (row?.storage_path) await supabase.storage.from(BUCKET).remove([row.storage_path]);
  const { error } = await supabase.from("materials").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(supabase, {
    actor: payload.email, action: "material.delete", targetType: "material", targetId: id, meta: {}, req,
  });
  return NextResponse.json({ ok: true });
}
