import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { logAudit } from "@/lib/audit";

export async function GET(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, body, pinned, published, created_at, updated_at")
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return serverError(error);
  return NextResponse.json({ announcements: data || [] });
}

export async function POST(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const title = (body.title || "").toString().trim();
  const text = (body.body || "").toString().trim();
  if (!title) return NextResponse.json({ error: "no_title" }, { status: 400 });
  if (!text) return NextResponse.json({ error: "no_body" }, { status: 400 });

  const row = {
    title,
    body: text,
    pinned: body.pinned === true,
    published: body.published === true,
  };
  const { data, error } = await supabase.from("announcements").insert(row).select("id").single();
  if (error) return serverError(error);

  await logAudit(supabase, {
    actor: payload.email, action: "announcement.create", targetType: "announcement",
    targetId: data?.id, meta: { title, pinned: row.pinned, published: row.published }, req,
  });
  return NextResponse.json({ ok: true, id: data?.id });
}

export async function PATCH(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const id = (body.id || "").toString();
  if (!id) return NextResponse.json({ error: "no_id" }, { status: 400 });

  const allowed = {};
  if (typeof body.title === "string") allowed.title = body.title.trim();
  if (typeof body.body === "string") allowed.body = body.body.trim();
  if (typeof body.pinned === "boolean") allowed.pinned = body.pinned;
  if (typeof body.published === "boolean") allowed.published = body.published;
  if (Object.keys(allowed).length === 0) return NextResponse.json({ error: "no_fields" }, { status: 400 });

  const { error } = await supabase.from("announcements").update(allowed).eq("id", id);
  if (error) return serverError(error);

  await logAudit(supabase, {
    actor: payload.email, action: "announcement.update", targetType: "announcement", targetId: id, meta: allowed, req,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "no_id" }, { status: 400 });

  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) return serverError(error);

  await logAudit(supabase, {
    actor: payload.email, action: "announcement.delete", targetType: "announcement", targetId: id, meta: {}, req,
  });
  return NextResponse.json({ ok: true });
}
