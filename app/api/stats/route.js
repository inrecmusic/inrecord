import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createDistributedLimiter, clientIp } from "@/lib/rate-limit";

// 公開社會證明端點：限流避免被高頻打點（60 次/分·IP）
const limiter = createDistributedLimiter({ limit: 60, windowMs: 60_000, prefix: "rl:stats" });

export async function GET(req) {
  const rl = await limiter(clientIp(req));
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  }

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
