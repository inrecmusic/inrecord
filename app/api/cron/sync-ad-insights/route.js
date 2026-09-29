import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isConfigured, fetchInsights } from "@/lib/meta-ads";
import { sendAdminAlert } from "@/lib/admin-alert";

// Meta 廣告 insights 定時同步（比照 release-coupons 的 auth）。未設 Meta env 時 no-op。
// 每 3 小時跑一次（含 05:20 UTC，ad-daily 依賴那一次）；回補最近 30 天以補上漏掉的日子。
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isConfigured()) return NextResponse.json({ ok: true, skipped: "not_configured" });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "no_db" }, { status: 500 });

  const days = 30;
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
    // 只在 05:xx UTC 那次寄告警，避免故障期間每 3 小時一封；回 502 讓 Vercel cron 紀錄標成失敗
    if (new Date().getUTCHours() === 5) {
      await sendAdminAlert({
        subject: "[InRecord] Meta 廣告資料同步失敗",
        html: `<p>廣告成效的 Meta 資料同步失敗，後台數字不會更新。</p><p>原因：${String(e?.message || "sync_failed").replace(/[<>&]/g, "").slice(0, 300)}</p><p>常見原因：Meta 權杖過期或廣告帳戶權限變更，請到 Vercel 檢查 META_ADS_ACCESS_TOKEN。</p>`,
      });
    }
    return NextResponse.json({ ok: false, error: e?.message || "sync_failed" }, { status: 502 });
  }
}
