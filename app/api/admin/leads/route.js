import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { buildLeadPatch } from "@/lib/preview-leads";

export async function GET(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const perPage = Math.min(200, Math.max(1, Number(searchParams.get("per_page")) || 50));
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: true, data: [], total: 0, page, perPage });

  try {
    const { data, error, count } = await supabase
      .from("course_preview_leads")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;
    return NextResponse.json({ ok: true, data, total: count, page, perPage });
  } catch (err) {
    return serverError(err);
  }
}

export async function PATCH(req) {
  const payload = await verifyAdminToken(req);
  if (!payload) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body?.id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const patch = buildLeadPatch(body);

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  try {
    const { data, error } = await supabase.from("course_preview_leads").update(patch).eq("id", body.id).select().single();
    if (error) throw error;
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return serverError(err);
  }
}
