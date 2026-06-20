import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";

export async function GET(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const { data, error } = await sb.from("sale_settings").select("*").eq("id", "default").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data || null });
}

export async function PATCH(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const body = await req.json();
  const patch = { id: "default", updated_at: new Date().toISOString() };

  if ("open_at" in body) patch.open_at = body.open_at || null;
  if ("early_bird_ends_at" in body) patch.early_bird_ends_at = body.early_bird_ends_at || null;

  if ("lock_override" in body) {
    const v = body.lock_override;
    if (v !== null && v !== "open" && v !== "locked") {
      return NextResponse.json({ error: "invalid_lock_override" }, { status: 400 });
    }
    patch.lock_override = v;
  }

  if ("plan_pricing" in body) {
    const pricing = body.plan_pricing || {};
    for (const k of Object.keys(pricing)) {
      const p = pricing[k] || {};
      for (const f of ["original", "earlyBird"]) {
        if (p[f] != null && (!Number.isInteger(p[f]) || p[f] < 0)) {
          return NextResponse.json({ error: `invalid_price_${k}_${f}` }, { status: 400 });
        }
      }
    }
    patch.plan_pricing = pricing;
  }

  const { data, error } = await sb.from("sale_settings")
    .upsert(patch, { onConflict: "id" }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
