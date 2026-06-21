import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { generateBatchCodes, normalizeManualCodes, MAX_BATCH_QUANTITY } from "@/lib/serial-codes";
import { normalizeCouponType, normalizeCouponPlan, couponValueError } from "@/lib/plans";

// GET：批次清單 + 每批 total / used 統計
export async function GET(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const { data: batches, error } = await supabase
    .from("coupon_batches").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: codes } = await supabase.from("coupons").select("batch_id, used").not("batch_id", "is", null);
  const stats = {};
  for (const c of codes || []) {
    const s = stats[c.batch_id] || (stats[c.batch_id] = { total: 0, used: 0 });
    s.total += 1;
    if ((c.used || 0) > 0) s.used += 1;
  }
  const data = (batches || []).map((b) => ({ ...b, total: stats[b.id]?.total || 0, used: stats[b.id]?.used || 0 }));
  return NextResponse.json({ data });
}

// POST：建立批次 + 產碼（mode: 'auto' | 'manual'）
export async function POST(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const body = await req.json();
  const name  = String(body.name || "").trim();
  const type  = normalizeCouponType(body.type);
  const plan  = normalizeCouponPlan(body.plan);
  const value = Number(body.value);
  const prefix = String(body.prefix || "").trim().toUpperCase() || null;
  const note  = String(body.note || "").trim() || null;
  const starts_at = body.starts_at || null;
  const ends_at   = body.ends_at || null;
  const mode  = body.mode === "manual" ? "manual" : "auto";

  if (!name) return NextResponse.json({ error: "missing_name" }, { status: 400 });
  const vErr = couponValueError(type, value);
  if (vErr) return NextResponse.json({ error: vErr }, { status: 400 });

  // 1) 決定要寫入的序號清單
  let wantCodes;
  if (mode === "manual") {
    wantCodes = normalizeManualCodes(body.codes);
    if (!wantCodes.length) return NextResponse.json({ error: "no_codes" }, { status: 400 });
    if (wantCodes.length > MAX_BATCH_QUANTITY) return NextResponse.json({ error: "too_many_codes" }, { status: 400 });
  } else {
    const quantity = Math.round(Number(body.quantity));
    if (!Number.isFinite(quantity) || quantity <= 0) return NextResponse.json({ error: "invalid_quantity" }, { status: 400 });
    if (quantity > MAX_BATCH_QUANTITY) return NextResponse.json({ error: "too_many_codes" }, { status: 400 });
    const { data: all } = await supabase.from("coupons").select("code");
    const existing = new Set((all || []).map((c) => c.code));
    try {
      wantCodes = generateBatchCodes({ prefix: prefix || "", quantity, existing });
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
  }

  // 2) 唯一性檢查（手動碼可能與既有碼衝突）
  const { data: dup } = await supabase.from("coupons").select("code").in("code", wantCodes);
  if (dup && dup.length) {
    return NextResponse.json({ error: "code_exists", conflicts: dup.map((d) => d.code) }, { status: 409 });
  }

  // 3) 寫入批次
  const { data: batch, error: bErr } = await supabase.from("coupon_batches")
    .insert({ name, type, value: Math.round(value), prefix, note, starts_at, ends_at, plan })
    .select().single();
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });

  // 4) 寫入序號（usage_limit=1）
  const rows = wantCodes.map((code) => ({
    name, code, type, value: Math.round(value),
    usage_limit: 1, status: "active", starts_at, ends_at, batch_id: batch.id, plan,
  }));
  const { error: cErr } = await supabase.from("coupons").insert(rows);
  if (cErr) {
    // 回滾批次，避免留下空批次
    await supabase.from("coupon_batches").delete().eq("id", batch.id);
    if (cErr.code === "23505") return NextResponse.json({ error: "code_exists" }, { status: 409 });
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }

  return NextResponse.json({ data: { ...batch, total: rows.length, used: 0 } });
}

// DELETE ?id= ：刪批次（CASCADE 連帶刪序號）
export async function DELETE(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const { error } = await supabase.from("coupon_batches").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
