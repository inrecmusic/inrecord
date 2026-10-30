import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { logAudit } from "@/lib/audit";
import { normalizeScoreInput } from "@/lib/score/admin-input";

// 後台「曲目」：v2 雙手 MusicXML 曲目 CRUD＋掛單元（score_units）。
// 舊 ABC 那筆（format='abc'）也列出來，但只能發布／下架，不能改內容或刪除。
// 新建一律草稿（published:false）——scores.published 的資料庫預設是 TRUE，不明寫就會在上傳當下對學員可見。
const LIST_COLS = "id,title,subtitle,format,difficulty,published,sort_order,version,file_name,meta,video_id,created_at,updated_at";

async function attachUnits(supabase, rows) {
  const ids = rows.map((r) => r.id);
  const { data: links, error } = ids.length
    ? await supabase.from("score_units").select("score_id,video_id,sort_order").in("score_id", ids).order("sort_order", { ascending: true })
    : { data: [], error: null };
  if (error) throw error;
  const videoIds = [...new Set([...(links || []).map((l) => l.video_id), ...rows.map((r) => r.video_id).filter(Boolean)])];
  const { data: videos, error: vErr } = videoIds.length
    ? await supabase.from("videos").select("id,title").in("id", videoIds)
    : { data: [], error: null };
  if (vErr) throw vErr;
  const titleOf = new Map((videos || []).map((v) => [v.id, v.title]));
  return rows.map((r) => {
    const unitIds = r.format === "abc" ? (r.video_id ? [r.video_id] : []) : (links || []).filter((l) => l.score_id === r.id).map((l) => l.video_id);
    return { ...r, units: unitIds.map((video_id) => ({ video_id, title: titleOf.get(video_id) || null })) };
  });
}

async function replaceUnits(supabase, scoreId, unitIds) {
  const { error: delErr } = await supabase.from("score_units").delete().eq("score_id", scoreId);
  if (delErr) return delErr;
  if (!unitIds.length) return null;
  const { error } = await supabase
    .from("score_units")
    .insert(unitIds.map((video_id, i) => ({ score_id: scoreId, video_id, sort_order: i })));
  return error || null;
}

const badInput = (errors, message) => NextResponse.json({ error: errors[0], errors, ...(message ? { message } : {}) }, { status: 400 });
// 單元指定伴奏只留還掛著的單元
const pruneUnits = (meta, unitIds) => {
  if (!meta?.unitAccompaniment || !unitIds) return meta;
  const keep = new Set(unitIds);
  return { ...meta, unitAccompaniment: Object.fromEntries(Object.entries(meta.unitAccompaniment).filter(([k]) => keep.has(k))) };
};

export async function GET(req) {
  if (!(await verifyAdminToken(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const id = new URL(req.url).searchParams.get("id");
  try {
    if (id) {
      const { data, error } = await supabase.from("scores").select(`${LIST_COLS},musicxml,abc`).eq("id", id).maybeSingle();
      if (error) return serverError(error);
      if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
      const [withUnits] = await attachUnits(supabase, [data]);
      return NextResponse.json({ data: withUnits });
    }
    const { data, error } = await supabase
      .from("scores")
      .select(LIST_COLS)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) return serverError(error);
    return NextResponse.json({ data: await attachUnits(supabase, data || []) });
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const { fields, unitIds, errors, metaPatch, message } = normalizeScoreInput(body, { partial: false });
  if (errors.length) return badInput(errors, message);
  const meta = pruneUnits({ ...fields.meta, ...metaPatch }, unitIds || []);

  const { data, error } = await supabase
    .from("scores")
    .insert({ ...fields, meta, format: "musicxml", published: false, version: 1 })
    .select("id")
    .single();
  if (error) return serverError(error);
  if (unitIds?.length) {
    const uErr = await replaceUnits(supabase, data.id, unitIds);
    if (uErr) return serverError(uErr);
  }
  await logAudit(supabase, {
    actor: payload.email, action: "score.create", targetType: "score", targetId: data.id,
    meta: { title: fields.title, units: unitIds?.length || 0 }, req,
  });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const { data: cur, error: curErr } = await supabase
    .from("scores")
    .select("id,format,version,published,musicxml,meta")
    .eq("id", id)
    .maybeSingle();
  if (curErr) return serverError(curErr);
  if (!cur) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { id: _id, ...rest } = body;
  if (cur.format === "abc" && Object.keys(rest).some((k) => k !== "published"))
    return NextResponse.json({ error: "abc_readonly" }, { status: 400 });

  const { fields, unitIds, errors, metaPatch, message } = normalizeScoreInput(rest, { partial: true });
  if (errors.length) return badInput(errors, message);

  const update = { ...fields, updated_at: new Date().toISOString() };
  const changedXml = fields.musicxml !== undefined && fields.musicxml !== cur.musicxml;
  if (changedXml) update.version = (cur.version || 1) + 1;
  if (fields.meta || Object.keys(metaPatch).length) {
    const merged = { ...(cur.meta || {}), ...(fields.meta || {}), ...metaPatch };
    if (fields.musicxml !== undefined && !metaPatch.jianpu) delete merged.jianpu; // 換成上傳檔，內容已不是簡譜打的
    update.meta = pruneUnits(merged, unitIds);
  }
  const { error } = await supabase.from("scores").update(update).eq("id", id);
  if (error) return serverError(error);
  if (unitIds !== undefined && cur.format === "musicxml") {
    const uErr = await replaceUnits(supabase, id, unitIds);
    if (uErr) return serverError(uErr);
  }

  const action =
    fields.published === true && !cur.published ? "score.publish"
    : fields.published === false && cur.published ? "score.unpublish"
    : "score.update";
  await logAudit(supabase, {
    actor: payload.email, action, targetType: "score", targetId: id,
    meta: { fields: Object.keys(fields).filter((k) => k !== "musicxml" && k !== "meta"), version: update.version ?? cur.version, units: unitIds?.length }, req,
  });
  return NextResponse.json({ ok: true, version: update.version ?? cur.version });
}

export async function DELETE(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  // 草稿、已發布、舊 ABC 都能刪（後台會先跳確認框）；掛單元的 score_units 由外鍵 CASCADE 一併刪
  const { data: cur, error: curErr } = await supabase.from("scores").select("id,format,published,title").eq("id", id).maybeSingle();
  if (curErr) return serverError(curErr);
  if (!cur) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { error } = await supabase.from("scores").delete().eq("id", id);
  if (error) return serverError(error);
  await logAudit(supabase, { actor: payload.email, action: "score.delete", targetType: "score", targetId: id, meta: { title: cur.title, format: cur.format, published: cur.published }, req });
  return NextResponse.json({ ok: true });
}
