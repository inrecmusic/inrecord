import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isConfigured, fetchInsights } from "@/lib/meta-ads";

// Meta 廣告 insights 每日同步（比照 release-coupons 的 auth）。未設 Meta env 時 no-op。
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isConfigured()) return NextResponse.json({ ok: true, skipped: "not_configured" });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "no_db" }, { status: 500 });

  const days = 7;
  const until = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString().slice(0, 10);
  try {
    const rows = await fetchInsights({ since, until });
    let upserted = 0;
    for (const r of rows) {
      if (!r.campaign_id || !r.date) continue;
      const { error } = await supabase.from("ad_insights").upsert({
        platform: "meta", campaign_id: r.campaign_id, campaign_name: r.campaign_name, date: r.date,
        spend: r.spend, impressions: r.impressions, clicks: r.clicks, reach: r.reach, frequency: r.frequency,
        meta_conversions: r.meta_conversions, meta_conversion_value: r.meta_conversion_value,
        updated_at: new Date().toISOString(),
      }, { onConflict: "platform,campaign_id,date" });
      if (!error) upserted++;
    }
    return NextResponse.json({ ok: true, since, until, fetched: rows.length, upserted });
  } catch (e) {
    console.error("[sync-ad-insights] failed", e?.message || e);
    return NextResponse.json({ ok: false, error: e?.message || "sync_failed" }, { status: 200 });
  }
}
