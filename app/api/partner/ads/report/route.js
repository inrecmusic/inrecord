import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { selectAll } from "@/lib/supabase-paginate";
import { buildAdReport } from "@/lib/ad-report";
import { adAdvice } from "@/lib/ad-advice";
import { verifyPartnerKey } from "@/lib/partner-auth";
import { createDistributedLimiter, clientIp } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

// 合作夥伴唯讀端點：廣告成效（給 Rick 的 AI 助理接）。
// 只讀不寫、只回廣告相關數字，不含任何學員個資（email、姓名、電話一律不出現）。
// 身分走 PARTNER_ADS_KEY（見 lib/partner-auth.js），與後台管理員 token 完全分離、可單獨撤銷。
//
// GET /api/partner/ads/report?from=YYYY-MM-DD&to=YYYY-MM-DD（皆為台灣日期；預設最近 30 天）
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const limiter = createDistributedLimiter({ limit: 60, windowMs: 3_600_000, prefix: "rl:partner:ads" });
const TW_OFFSET_MS = 8 * 3600 * 1000;
const twDay = (ms) => new Date(ms + TW_OFFSET_MS).toISOString().slice(0, 10);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req) {
  const auth = verifyPartnerKey(req);
  if (!auth.ok) {
    // not_configured 與 unauthorized 都回 401，不讓外部分辨「金鑰沒設」還是「金鑰錯」
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const rl = await limiter(clientIp(req));
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });

  const sp = new URL(req.url).searchParams;
  const now = Date.now();
  const to = DAY_RE.test(sp.get("to") || "") ? sp.get("to") : twDay(now);
  const from = DAY_RE.test(sp.get("from") || "") ? sp.get("from") : twDay(now - 30 * 86400_000);
  if (from > to) return NextResponse.json({ error: "invalid_range" }, { status: 400 });

  try {
    // 訂單多抓兩天：ad_insights.date 是台灣日，訂單 created_at 是 UTC，邊界要留緩衝才不會漏算
    const orderFrom = new Date(Date.parse(from + "T00:00:00+08:00") - 2 * 86400_000).toISOString();
    const orderTo = new Date(Date.parse(to + "T23:59:59+08:00") + 2 * 86400_000).toISOString();
    const [insights, orders] = await Promise.all([
      selectAll(supabase, "ad_insights", (q) =>
        q.select("campaign_id, campaign_name, date, spend, impressions, clicks, reach, frequency, meta_conversions, meta_conversion_value")
          .gte("date", from).lte("date", to)),
      // 只取算 ROAS 需要的三欄，刻意不取 email／姓名／電話——這把金鑰不該看得到任何個資
      selectAll(supabase, "orders", (q) =>
        q.select("amount, created_at, attribution").eq("status", "paid")
          .gte("created_at", orderFrom).lte("created_at", orderTo)),
    ]);

    const targetRoas = Number(process.env.META_TARGET_ROAS) || 3;
    const report = buildAdReport({ insights, paidOrders: orders, targetRoas });

    await logAudit(supabase, {
      actor: auth.label, action: "partner.ads.read", targetType: "ad_report",
      meta: { from, to, campaigns: report.campaigns?.length || 0 }, req,
    });

    return NextResponse.json({
      ok: true,
      period: { from, to, timezone: "Asia/Taipei" },
      target_roas: targetRoas,
      totals: report.totals,
      campaigns: report.campaigns,
      advice: adAdvice(report, { targetRoas }),
      note: "ROAS 為本站真實已付款訂單營收 ÷ 廣告花費，以廣告網址的 utm_campaign 對應 Meta 活動；不採用 Meta 自報的轉換價值。",
    });
  } catch (e) {
    console.error("[partner/ads/report] failed", e?.message || e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
