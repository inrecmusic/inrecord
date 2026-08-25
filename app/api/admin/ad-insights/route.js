import { NextResponse } from "next/server";
import { serverError } from "@/lib/api-error";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { selectAll } from "@/lib/supabase-paginate";
import { buildAdReport } from "@/lib/ad-report";

export async function GET(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const days = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 30));
  const sinceISO = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const sinceDate = sinceISO.slice(0, 10);
  const targetRoas = Number(process.env.META_TARGET_ROAS) || 3;

  // selectAll 分頁：長區間（如 365 天）的每日 insights 與訂單量都可能超過 1000 列而被截斷
  let insights, orders;
  try {
    [insights, orders] = await Promise.all([
      selectAll(sb, "ad_insights", q => q.select("campaign_id, campaign_name, date, spend, impressions, clicks, reach, frequency, meta_conversions, meta_conversion_value").gte("date", sinceDate)),
      selectAll(sb, "orders", q => q.select("amount, created_at, attribution").eq("status", "paid").gte("created_at", sinceISO)),
    ]);
  } catch (e) { return serverError(e); }

  const report = buildAdReport({ insights, paidOrders: orders, targetRoas });
  return NextResponse.json({ data: report, days, targetRoas });
}
