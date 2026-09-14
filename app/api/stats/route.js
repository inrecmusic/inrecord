import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createDistributedLimiter, clientIp } from "@/lib/rate-limit";
import { getSiteStats } from "@/lib/site-stats";

// 公開社會證明端點：限流避免被高頻打點（60 次/分·IP）
const limiter = createDistributedLimiter({ limit: 60, windowMs: 60_000, prefix: "rl:stats" });

// 首頁已改由伺服端帶入數字（lib/site-stats），此端點只剩沒拿到 prop 時的退路；
// 讓 CDN 快取 60 秒、過期後 5 分鐘內先回舊值再背景更新，避免每位訪客都打一次 DB。
const CACHE = "public, s-maxage=60, stale-while-revalidate=300";

export async function GET(req) {
  const rl = await limiter(clientIp(req));
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  }

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "db not configured" }, { status: 500 });

  const stats = await getSiteStats(db);
  if (!stats) return NextResponse.json({ ok: false, error: "query failed" }, { status: 500 });

  return NextResponse.json(stats, { headers: { "Cache-Control": CACHE } });
}
