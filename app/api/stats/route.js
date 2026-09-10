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
    db.from("orders").select("id", { count: "exact", head: true }).eq("status", "paid").or("source.is.null,source.neq.manual"), // 手動開通單不算購買人數；舊單 source 為 NULL 照算
    db.from("ratings").select("score,user_email").eq("hidden", false), // 後台隱藏的惡意評價不列入首頁平均
  ]);

  if (e1 || e2) return NextResponse.json({ ok: false, error: "query failed" }, { status: 500 });

  // 排除自家／管理員帳號自評（大小寫不敏感）；user_email 為空的評價照算
  const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const scores = (ratingRows || [])
    .filter((r) => !adminEmail || String(r.user_email || "").trim().toLowerCase() !== adminEmail)
    .map((r) => Number(r.score))
    .filter(Number.isFinite);

  const ratingCount = scores.length;
  const rating = ratingCount > 0 ? scores.reduce((sum, s) => sum + s, 0) / ratingCount : null;

  // ratingCount 交給前端判斷樣本數夠不夠（少於 3 筆不顯示星等，避免不實廣告）
  return NextResponse.json({ ok: true, purchases: purchases ?? 0, rating, ratingCount });
}
