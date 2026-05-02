// app/api/admin/leads/route.js
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

function checkAuth(req) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace("Bearer ", "");
  // 簡易 token 驗證（正式上線可換成 JWT 或 Supabase Auth）
  return token === process.env.ADMIN_PASSWORD;
}

export async function GET(req) {
  if (!checkAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page") || 1);
  const perPage = Number(searchParams.get("per_page") || 50);
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
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req) {
  if (!checkAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, status, ...rest } = await req.json();
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const patch = { status, updated_at: new Date().toISOString(), ...rest };
  if (status === "demo_opened") { patch.demo_opened = true; patch.demo_opened_at = patch.demo_opened_at || new Date().toISOString(); }
  if (status === "purchased")   { patch.purchased = true; patch.purchased_at = patch.purchased_at || new Date().toISOString(); }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  try {
    const { data, error } = await supabase.from("course_preview_leads").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
