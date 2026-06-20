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

  if ("lock_override" in body) {
    const v = body.lock_override;
    if (v !== null && v !== "open" && v !== "locked") {
      return NextResponse.json({ error: "invalid_lock_override" }, { status: 400 });
    }
    patch.lock_override = v;
  }

  if ("list_price" in body) {
    const lp = body.list_price || {};
    for (const k of Object.keys(lp)) {
      if (lp[k] != null && (!Number.isInteger(lp[k]) || lp[k] < 0)) {
        return NextResponse.json({ error: `invalid_list_price_${k}` }, { status: 400 });
      }
    }
    patch.list_price = lp;
  }

  if ("waves" in body) {
    const waves = Array.isArray(body.waves) ? body.waves : null;
    if (!waves) return NextResponse.json({ error: "invalid_waves" }, { status: 400 });
    for (let i = 0; i < waves.length; i++) {
      const w = waves[i] || {};
      if (!w.starts_at || isNaN(Date.parse(w.starts_at)) || !w.ends_at || isNaN(Date.parse(w.ends_at))) {
        return NextResponse.json({ error: `invalid_wave_${i}_dates` }, { status: 400 });
      }
      if (Date.parse(w.starts_at) >= Date.parse(w.ends_at)) {
        return NextResponse.json({ error: `invalid_wave_${i}_range` }, { status: 400 });
      }
      const prices = w.prices || {};
      for (const k of Object.keys(prices)) {
        if (prices[k] != null && (!Number.isInteger(prices[k]) || prices[k] < 0)) {
          return NextResponse.json({ error: `invalid_wave_${i}_price_${k}` }, { status: 400 });
        }
      }
    }
    patch.waves = waves;
  }

  const { data, error } = await sb.from("sale_settings")
    .upsert(patch, { onConflict: "id" }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
