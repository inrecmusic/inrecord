import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";

export async function GET(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const { data, error } = await supabase
    .from("coupons")
    .select("*")
    .is("batch_id", null)              // 序號（批次碼）不出現在一般優惠券列表
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data || [] });
}

export async function POST(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const body = await req.json();
  const name  = String(body.name || "").trim();
  const code  = String(body.code || "").trim().toUpperCase();
  const type  = ["fixed", "price"].includes(body.type) ? body.type : "percent";
  const plan  = ["course", "bundle"].includes(body.plan) ? body.plan : null;
  const value = Number(body.value);

  if (!name) return NextResponse.json({ error: "missing_name" }, { status: 400 });
  if (!code) return NextResponse.json({ error: "missing_code" }, { status: 400 });
  if (!Number.isFinite(value) || value <= 0) return NextResponse.json({ error: "invalid_value" }, { status: 400 });
  if (type === "percent" && value > 100) return NextResponse.json({ error: "percent_over_100" }, { status: 400 });

  const { data, error } = await supabase.from("coupons").insert({
    name,
    code,
    type,
    value: Math.round(value),
    usage_limit: body.usage_limit ? Math.round(Number(body.usage_limit)) : null,
    starts_at: body.starts_at || null,
    ends_at:   body.ends_at || null,
    status:    "active",
    plan,
  }).select().single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "code_exists" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}

export async function PATCH(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const { id, ...fields } = await req.json();
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  // 僅允許更新白名單欄位
  const allowed = {};
  for (const k of ["name", "type", "value", "usage_limit", "starts_at", "ends_at", "status", "plan"]) {
    if (k in fields) allowed[k] = fields[k];
  }

  const { error } = await supabase.from("coupons").update(allowed).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const { error } = await supabase.from("coupons").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
