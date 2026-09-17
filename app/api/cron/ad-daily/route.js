import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { selectAll } from "@/lib/supabase-paginate";
import { buildAdReport } from "@/lib/ad-report";
import { buildAdDailyEmail } from "@/lib/ad-daily";
import { sendAdminAlert } from "@/lib/admin-alert";

// 廣告日報：每天把「昨天」的投放狀況寄給管理員。
// ⚠️ 排程時間是 UTC（同 vercel.json 其他 cron）。本檔設 05:40 UTC＝台灣 13:40，刻意排在
// sync-ad-insights（05:20 UTC＝台灣 13:20）之後 20 分鐘：那次同步才會把「昨天一整天」的
// 數字補齊。若改成台灣早上寄，讀到的昨日資料會是前一天中午同步的半天份，數字會偏低。
//
// 刻意不經過模型：日報要天天寄、數字不能錯，判斷規則（該停／該減／該加碼）固定，
// 全部由 lib/ad-advice.js 用看得見的門檻算。週報才需要模型做跨面向解讀。
//
// 沒花錢就不寄：每天收到一封「昨天花費 0」的信，兩週後就沒人會點開了。
export const maxDuration = 60;

const TW_OFFSET_MS = 8 * 3600 * 1000;
const twDay = (ms) => new Date(ms + TW_OFFSET_MS).toISOString().slice(0, 10);

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "no_db" }, { status: 500 });

  const now = Date.now();
  const day = twDay(now - 86400_000); // 昨天（台灣時區）

  try {
    // ad_insights.date 已是廣告帳戶時區（台灣）的日期，直接用同一個 day 取。
    // 訂單那側 buildAdReport 內部會把 created_at 換算成台灣日，兩邊才對得起來。
    const [insights, orders] = await Promise.all([
      selectAll(supabase, "ad_insights", (q) =>
        q.select("campaign_id, campaign_name, date, spend, impressions, clicks, reach, frequency, meta_conversions, meta_conversion_value").eq("date", day)),
      selectAll(supabase, "orders", (q) =>
        q.select("amount, created_at, attribution, status")
          .eq("status", "paid")
          .gte("created_at", new Date(now - 3 * 86400_000).toISOString())),
    ]);

    if (!insights.length) return NextResponse.json({ ok: true, day, skipped: "no_insights" });

    const targetRoas = Number(process.env.META_TARGET_ROAS) || 3;
    const report = buildAdReport({ insights, paidOrders: orders, targetRoas });
    const mail = buildAdDailyEmail({
      report,
      dayLabel: `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`,
      targetRoas,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "https://inrecordmusic.com",
    });
    if (!mail) return NextResponse.json({ ok: true, day, skipped: "no_spend" });

    const r = await sendAdminAlert(mail);
    return NextResponse.json({ ok: true, day, spend: report.totals.spend, roas: report.totals.trueRoas, sent: r?.success === true, skipped: r?.skipped || false });
  } catch (e) {
    console.error("[ad-daily] failed", e?.message || e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 200 });
  }
}
