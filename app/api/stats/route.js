import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "db not configured" }, { status: 500 });

  const [{ count: purchases, error: e1 }, { data: ratingRows, error: e2 }] = await Promise.all([
    db.from("orders").select("id", { count: "exact", head: true }).eq("status", "paid"),
    db.from("ratings").select("score"),
  ]);

  if (e1 || e2) return NextResponse.json({ ok: false, error: "query failed" }, { status: 500 });

  const rating =
    ratingRows && ratingRows.length > 0
      ? ratingRows.reduce((sum, r) => sum + r.score, 0) / ratingRows.length
      : null;

  return NextResponse.json({ ok: true, purchases: purchases ?? 0, rating });
}
