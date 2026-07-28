import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAdminToken } from "@/lib/adminAuth";
import { buildAdReport } from "@/lib/ad-report";

export async function GET(req) {
  if (!await verifyAdminToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const days = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 30));
  const sinceISO = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const sinceDate = sinceISO.slice(0, 10);
  const targetRoas = Number(process.env.META_TARGET_ROAS) || 3;

  const [{ data: insights, error: e1 }, { data: orders, error: e2 }] = await Promise.all([
    sb.from("ad_insights").select("campaign_id, campaign_name, date, spend, impressions, clicks, reach, frequency, meta_conversions, meta_conversion_value").gte("date", sinceDate),
    sb.from("orders").select("amount, created_at, attribution").eq("status", "paid").gte("created_at", sinceISO),
  ]);
  if (e1 || e2) return NextResponse.json({ error: (e1 || e2).message }, { status: 500 });

  const report = buildAdReport({ insights: insights || [], paidOrders: orders || [], targetRoas });
  return NextResponse.json({ data: report, days, targetRoas });
}
