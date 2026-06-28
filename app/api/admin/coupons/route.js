import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { validateDateRange } from "@/lib/date-range";

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
  const dr = validateDateRange(body.starts_at, body.ends_at);
  if (!dr.ok) return NextResponse.json({ error: dr.error }, { status: 400 });

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

  const { id, ...fields } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  // 白名單 + 值域驗證（比照 POST，避免 PATCH 把券改成 percent>100 / 負值 / 非法 type）
  const allowed = {};
  if ("name" in fields) { const n = String(fields.name || "").trim(); if (!n) return NextResponse.json({ error: "missing_name" }, { status: 400 }); allowed.name = n; }
  if ("type" in fields) { if (!["percent", "fixed", "price"].includes(fields.type)) return NextResponse.json({ error: "invalid_type" }, { status: 400 }); allowed.type = fields.type; }
  if ("plan" in fields) allowed.plan = ["course", "bundle"].includes(fields.plan) ? fields.plan : null;
  if ("status" in fields) { if (!["active", "disabled"].includes(fields.status)) return NextResponse.json({ error: "invalid_status" }, { status: 400 }); allowed.status = fields.status; }
  if ("usage_limit" in fields) {
    if (fields.usage_limit == null || fields.usage_limit === "") allowed.usage_limit = null;
    else { const u = Math.round(Number(fields.usage_limit)); if (!Number.isFinite(u) || u < 0) return NextResponse.json({ error: "invalid_usage_limit" }, { status: 400 }); allowed.usage_limit = u; }
  }
  if ("value" in fields) { const v = Number(fields.value); if (!Number.isFinite(v) || v <= 0) return NextResponse.json({ error: "invalid_value" }, { status: 400 }); allowed.value = Math.round(v); }
  if (("starts_at" in fields) || ("ends_at" in fields)) {
    const dr = validateDateRange(fields.starts_at ?? null, fields.ends_at ?? null);
    if (!dr.ok) return NextResponse.json({ error: dr.error }, { status: 400 });
    if ("starts_at" in fields) allowed.starts_at = fields.starts_at || null;
    if ("ends_at" in fields) allowed.ends_at = fields.ends_at || null;
  }

  // percent ≤ 100：依「最終 type/value」判定（patch 優先，缺則查現有），擋住改值或改型後超界
  if (allowed.type === "percent" || (allowed.value != null && !("type" in allowed))) {
    let effType = allowed.type, effValue = allowed.value;
    if (effType === undefined || effValue === undefined) {
      const { data: cur } = await supabase.from("coupons").select("type, value").eq("id", id).single();
      if (effType === undefined) effType = cur?.type;
      if (effValue === undefined) effValue = cur?.value;
    }
    if (effType === "percent" && Number(effValue) > 100) return NextResponse.json({ error: "percent_over_100" }, { status: 400 });
  }

  if (Object.keys(allowed).length === 0) return NextResponse.json({ ok: true });
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
