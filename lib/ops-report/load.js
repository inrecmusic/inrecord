// lib/ops-report/load.js — 讀取層：從 Supabase／Brevo／廣告表撈資料交給 buildPack。
// ⚠️ 查詢失敗一律回 null（不是空陣列）：空陣列會被當成「本週真的沒有資料」，週報就會斬釘截鐵寫
//    「本週 0 筆訂單、營收 0」。回 null 才會在資料包標成 unavailable，讓模型改說「尚未接上／查詢失敗」。
import { selectAll } from "../supabase-paginate.js";
import { buildAdReport } from "../ad-report.js";
import { isConfigured as adsConfigured } from "../meta-ads.js";
import { quotaSummary, pickSendLimitPlan, planWindow } from "../brevo-quota.js";
import { buildPack } from "./collect.js";

async function attempt(p) { try { const v = await p; return v ?? null; } catch { return null; } }

async function fetchBrevoQuota(env, fetchImpl) {
  if (!env.BREVO_API_KEY) return null;
  try {
    const H = { "api-key": env.BREVO_API_KEY };
    const acc = await (await fetchImpl("https://api.brevo.com/v3/account", { headers: H })).json();
    const { start, end } = planWindow(pickSendLimitPlan(acc));
    const rep = await (await fetchImpl(`https://api.brevo.com/v3/smtp/statistics/aggregatedReport?startDate=${start}&endDate=${end}`, { headers: H })).json();
    return quotaSummary(acc, rep.requests);
  } catch { return null; }
}

async function fetchLeadsCount(env, fetchImpl) {
  if (env.LEAD_CAPTURE !== "on" || !env.BREVO_API_KEY || !env.BREVO_LIST_ID) return null;
  try {
    const d = await (await fetchImpl(`https://api.brevo.com/v3/contacts/lists/${env.BREVO_LIST_ID}`, { headers: { "api-key": env.BREVO_API_KEY } })).json();
    return Number.isFinite(d.totalSubscribers) ? d.totalSubscribers : null;
  } catch { return null; }
}

// period：{ start, end, prevStart, label }（weeklyPeriod 或 rollingPeriod）
export async function loadPack(supabase, period, { now = new Date(), env = process.env, fetchImpl = fetch } = {}) {
  const sinceISO = period.prevStart.toISOString();
  const [allOrders, enrollments, progressRows, emailLog, unsubscribes, coupons, saleRow, videos, announcements] = await Promise.all([
    attempt(selectAll(supabase, "orders", (q) => q.select("status, amount, created_at, updated_at, source, email, grant_email, plan, coupon_code").gte("created_at", sinceISO))),
    attempt(selectAll(supabase, "enrollments", (q) => q.select("email"))),
    attempt(selectAll(supabase, "progress", (q) => q.select("user_id, completed, viewed_seconds, watched_at"))),
    attempt(selectAll(supabase, "email_log", (q) => q.select("to_email, kind, status, created_at").gte("created_at", period.start.toISOString()))),
    attempt(selectAll(supabase, "newsletter_unsubscribes", (q) => q.select("email, created_at"))),
    attempt(selectAll(supabase, "coupons", (q) => q.select("code, type, value, status, usage_limit, plan").is("batch_id", null))),
    // 單列查詢：supabase-js 不會 throw，錯誤在 r.error；沒有那列（r.data=null）不算失敗，回 {}。
    attempt(supabase.from("sale_settings").select("*").eq("id", "default").maybeSingle().then((r) => { if (r.error) throw new Error(r.error.message); return r.data || {}; })),
    attempt(selectAll(supabase, "videos", (q) => q.select("title, published, bunny_video_id"))),
    attempt(selectAll(supabase, "announcements", (q) => q.select("published"))),
  ]);
  const t = (iso) => Date.parse(iso);
  const orders = allOrders && allOrders.filter((o) => t(o.created_at) >= period.start.getTime() && t(o.created_at) < period.end.getTime());
  const prevOrders = allOrders && allOrders.filter((o) => t(o.created_at) >= period.prevStart.getTime() && t(o.created_at) < period.start.getTime());

  let adReport = null;
  if (adsConfigured()) {
    const [insights, paid] = await Promise.all([
      attempt(selectAll(supabase, "ad_insights", (q) => q.select("campaign_id, campaign_name, date, spend, impressions, clicks, reach, frequency, meta_conversions, meta_conversion_value").gte("date", period.start.toISOString().slice(0, 10)))),
      attempt(selectAll(supabase, "orders", (q) => q.select("amount, created_at, attribution").eq("status", "paid").gte("created_at", period.start.toISOString()))),
    ]);
    // 任一邊查詢失敗就維持 null（＝資料包裡的「尚未接上」），不要用半套資料算出錯誤的 ROAS
    if (insights && paid) {
      try { adReport = buildAdReport({ insights, paidOrders: paid, targetRoas: Number(env.META_TARGET_ROAS) || 3 }); } catch { adReport = null; }
    }
  }
  const [brevoQuota, leadsCount] = await Promise.all([fetchBrevoQuota(env, fetchImpl), fetchLeadsCount(env, fetchImpl)]);
  return buildPack({
    period, now, orders, prevOrders,
    enrolledEmails: enrollments && enrollments.map((e) => e.email).filter(Boolean),
    progressRows, emailLog, unsubscribes, coupons, saleSettings: saleRow, videos, announcements, adReport, brevoQuota, leadsCount,
  });
}
