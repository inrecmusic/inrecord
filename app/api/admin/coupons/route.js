import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { normalizeCouponType, normalizeCouponPlan, couponValueError } from "@/lib/plans";

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
  const type  = normalizeCouponType(body.type);
  const plan  = normalizeCouponPlan(body.plan);
  const value = Number(body.value);

  if (!name) return NextResponse.json({ error: "missing_name" }, { status: 400 });
  if (!code) return NextResponse.json({ error: "missing_code" }, { status: 400 });
  const vErr = couponValueError(type, value);
  if (vErr) return NextResponse.json({ error: vErr }, { status: 400 });

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

  // 正規化受控欄位（與 POST 同規則，避免繞過 UI 直接 PATCH 出非法狀態）
  if ("type"  in allowed) allowed.type  = normalizeCouponType(allowed.type);
  if ("plan"  in allowed) allowed.plan  = normalizeCouponPlan(allowed.plan);
  if ("value" in allowed) allowed.value = Math.round(Number(allowed.value));
  if ("status" in allowed && !["active", "disabled"].includes(allowed.status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  // 調整 type 或 value 時，以「合併後」的有效值驗證
  //（擋 percent 券被改成 value=150，或 type 改 price/percent 後沿用不相容舊值的情況）
  if ("type" in allowed || "value" in allowed) {
    const { data: existing } = await supabase
      .from("coupons").select("type, value").eq("id", id).maybeSingle();
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const effType  = "type"  in allowed ? allowed.type  : existing.type;
    const effValue = "value" in allowed ? allowed.value : existing.value;
    const vErr = couponValueError(effType, effValue);
    if (vErr) return NextResponse.json({ error: vErr }, { status: 400 });
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
