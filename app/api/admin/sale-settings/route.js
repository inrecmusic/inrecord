import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { PLAN_CATALOG } from "@/lib/plans";
import { validateFanPlan, fanPlanCoupon } from "@/lib/sale";

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

  if ("list_anchor" in body) {
    const la = body.list_anchor || {};
    for (const k of Object.keys(la)) {
      if (la[k] != null && (!Number.isInteger(la[k]) || la[k] < 0)) {
        return NextResponse.json({ error: `invalid_list_anchor_${k}` }, { status: 400 });
      }
    }
    patch.list_anchor = la;
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
      for (const plan of Object.keys(PLAN_CATALOG)) {
        if (PLAN_CATALOG[plan].sellable === false) continue;   // 已下架方案不要求波段價
        if (!Number.isInteger(prices[plan]) || prices[plan] < 0) {
          return NextResponse.json({ error: `invalid_wave_${i}_missing_${plan}` }, { status: 400 });
        }
      }
    }
    // reject overlapping waves
    const sorted = [...waves].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
    for (let i = 1; i < sorted.length; i++) {
      if (Date.parse(sorted[i].starts_at) < Date.parse(sorted[i - 1].ends_at)) {
        return NextResponse.json({ error: "waves_overlap" }, { status: 400 });
      }
    }
    patch.waves = waves;
  }

  // 粉絲方案設定驗證
  if ("fan_plan" in body) {
    const v = validateFanPlan(body.fan_plan);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    patch.fan_plan = {
      enabled: body.fan_plan.enabled,
      deadline: body.fan_plan.deadline,
      proof_price: body.fan_plan.proof_price,
      direct_price: body.fan_plan.direct_price,
    };
  }

  // 先同步衍生的直購券 FAN3999（成功才寫設定）——避免「設定已存、券沒同步」的不一致：
  // 失敗時 sale_settings 尚未更新，回 500 後重存即可乾淨重試。
  if ("fan_plan" in body) {
    const { error: cErr } = await sb.from("coupons")
      .upsert(fanPlanCoupon(patch.fan_plan), { onConflict: "code" });
    if (cErr) return NextResponse.json({ error: "fan_coupon_sync_failed: " + cErr.message }, { status: 500 });
  }

  const { data, error } = await sb.from("sale_settings")
    .upsert(patch, { onConflict: "id" }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}
