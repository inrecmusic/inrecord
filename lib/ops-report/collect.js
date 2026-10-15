// lib/ops-report/collect.js — 週報資料包：全部數字由這裡算（純函式），模型只解讀。鍵序固定（快取／可核對）。
import { summarizeOrders } from "../reconciliation.js";
import { isNonRevenueOrder } from "../order-stats.js";
import { pickUngrantedPayuni } from "../order-enrolled.js";
import { currentPrice } from "../sale.js";
import { adAdvice } from "../ad-advice.js";

const DAY_MS = 86400 * 1000;
const TW_OFFSET_MS = 8 * 3600 * 1000;
const inRange = (iso, start, end) => { const t = Date.parse(iso || ""); return t >= start.getTime() && t < end.getTime(); };
const pad2 = (n) => String(n).padStart(2, "0");
// 台灣時間標籤（例「10/23 00:00」）：時間欄位是 UTC ISO，模型自己換算會把台灣 10/23 00:00 寫成 10/22。
export function twLabel(t) {
  const d = new Date(t + TW_OFFSET_MS);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

function orderBlock(orders, now) {
  const s = summarizeOrders(orders);
  // 來源分布只數「有效收款」的已付款單（排除手動開通／測試單），口徑與 paid 一致——
  // 否則會寫出「付款 5 筆（payuni 5、manual 2）」這種加起來對不上的數字。
  const bySource = {};
  for (const o of orders) if (o.status === "paid" && !isNonRevenueOrder(o)) bySource[o.source || "unknown"] = (bySource[o.source || "unknown"] || 0) + 1;
  const stuck = orders.filter((o) => o.status === "pending" && now.getTime() - Date.parse(o.created_at) > 72 * 3600 * 1000).length;
  return { created: orders.length, paid: s.paid.count, revenue: s.paid.amount, refunded: s.refunded.count, refund_amount: s.refunded.amount, stuck_pending: stuck, paid_by_source: bySource };
}

// 優惠券異常：名稱像測試用、指定價券低於當前波段價、無上限指定價券。停用券不看。
export function couponAnomalies(coupons = [], settings = {}, now = new Date()) {
  const out = [];
  for (const c of coupons) {
    if ((c.status || "active") !== "active") continue;
    const reasons = [];
    if (/TEST|SMOKE|DEMO/i.test(c.code || "")) reasons.push("test_like");
    if (c.type === "price") {
      const cur = currentPrice(c.plan || "bundle", settings, now);
      if (Number.isFinite(cur) && Number(c.value) < cur) reasons.push("below_current_price");
      if (c.usage_limit == null) reasons.push("unlimited_price_coupon");
    }
    if (reasons.length) out.push({ code: c.code, type: c.type, value: c.value, usage_limit: c.usage_limit ?? null, reasons });
  }
  return out;
}

const MILESTONES = [["2026-09-30T00:00:00+08:00", "第一批章節上架（Ch1～Ch3）"], ["2026-10-31T00:00:00+08:00", "正式開課日：全數上架"]];
export function upcomingDates(settings = {}, now = new Date(), days = 14) {
  const horizon = now.getTime() + days * DAY_MS;
  const items = [];
  const fp = settings.fan_plan || {};
  if (fp.enabled && fp.deadline) items.push({ at: fp.deadline, label: "粉絲方案截止" });
  for (const w of settings.waves || []) {
    const prices = Object.entries(w.prices || {}).map(([k, v]) => `${k} ${v}`).join("、");
    items.push({ at: w.starts_at, label: `波段換價：${prices}` });
  }
  for (const [at, label] of MILESTONES) items.push({ at, label });
  return items
    .map((i) => ({ ...i, t: Date.parse(i.at) }))
    .filter((i) => Number.isFinite(i.t) && i.t >= now.getTime() && i.t <= horizon)
    .sort((a, b) => a.t - b.t)
    .map(({ at, label, t }) => ({ at, label_tw: twLabel(t), label }));
}

// email_log.kind 白名單：只有後台電子報群發算「電子報寄出量」。
// 沒有這道過濾，購買信（purchase／presale）、開課信（launch）、試看信（trial）、挽回信（recovery）、
// 週報信（ops_report）會全被算成電子報寄出量。
export const NEWSLETTER_KINDS = new Set(["newsletter"]);
const newsletterSent = (log) => log && log.filter((e) => e.status === "sent" && NEWSLETTER_KINDS.has(e.kind)).length;
const activeUsers = (rows) => rows && new Set(rows.map((p) => p.user_id)).size;
const orNull = (v) => (v == null ? null : v);

export function buildPack({ period, now = new Date(), orders = [], prevOrders = [], enrolledEmails = [], progressRows = [], emailLog = [], unsubscribes = [], coupons = [], saleSettings = {}, videos = [], announcements = [], adReport = null, prevAdSpend = null, brevoQuota = null, leadsCount = null }) {
  const { start, end, prevStart } = period;
  // 任何一項是 null 代表那個查詢失敗（見 load.js）：該區塊填 null 並列進 unavailable，
  // 模型才會說「查詢失敗／尚未接上」，而不是把「查不到」當成「本週 0 筆」寫進週報。
  const sources = { orders, enrollments: enrolledEmails, progress: progressRows, email_log: emailLog, unsubscribes, coupons, sale_settings: saleSettings, videos, announcements };
  const unavailable = Object.entries(sources).filter(([, v]) => v == null).map(([k]) => k);
  const settings = saleSettings || {};
  const weekLog = emailLog && emailLog.filter((e) => inRange(e.created_at, start, end));
  const prevLog = emailLog && prevStart ? emailLog.filter((e) => inRange(e.created_at, prevStart, start)) : null;
  const weekProgress = progressRows && progressRows.filter((p) => inRange(p.watched_at, start, end));
  const prevProgress = progressRows && prevStart ? progressRows.filter((p) => inRange(p.watched_at, prevStart, start)) : null;
  const published = videos && videos.filter((v) => v.published);
  const missing = published && published.filter((v) => !v.bunny_video_id);
  const ob = orders && orderBlock(orders, now);
  const pob = prevOrders && orderBlock(prevOrders, now);
  return {
    period: { start: start.toISOString(), end: end.toISOString(), label: period.label },
    unavailable,
    // 六個核心指標「本週／上週」：程式算好，generateReport 直接附到報告（模型不抄數字）。null＝尚未接上／查詢失敗。
    core: {
      revenue: { this_week: ob ? ob.revenue : null, last_week: pob ? pob.revenue : null },
      paid_orders: { this_week: ob ? ob.paid : null, last_week: pob ? pob.paid : null },
      created_orders: { this_week: ob ? ob.created : null, last_week: pob ? pob.created : null },
      active_students: { this_week: orNull(activeUsers(weekProgress)), last_week: orNull(activeUsers(prevProgress)) },
      ad_spend: { this_week: adReport ? Math.round(Number(adReport.totals?.spend) || 0) : null, last_week: prevAdSpend == null ? null : Math.round(Number(prevAdSpend) || 0) },
      newsletter_sent: { this_week: orNull(newsletterSent(weekLog)), last_week: orNull(newsletterSent(prevLog)) },
    },
    orders: ob,
    prev_orders: pob,
    pending_actions: {
      ungranted: orders && enrolledEmails
        ? pickUngrantedPayuni(orders.filter((o) => o.status === "paid"), enrolledEmails).map((o) => ({ email: o.email, plan: o.plan, paid_at: o.updated_at || o.created_at }))
        : null,
      failed_emails: weekLog && weekLog.filter((e) => e.status !== "sent").slice(0, 10).map((e) => ({ to: e.to_email, kind: e.kind, at: e.created_at })),
    },
    students: {
      enrolled: enrolledEmails && enrolledEmails.length,
      active_this_week: activeUsers(weekProgress),
      units_watched_this_week: weekProgress && weekProgress.length,
      units_completed_this_week: weekProgress && weekProgress.filter((p) => p.completed).length,
      viewed_minutes_all_time: progressRows && Math.round(progressRows.reduce((a, p) => a + (Number(p.viewed_seconds) || 0), 0) / 60),
    },
    newsletter: {
      sent: newsletterSent(weekLog),
      unsubscribes: unsubscribes && unsubscribes.filter((u) => inRange(u.created_at, start, end)).length,
      quota: brevoQuota,
      leads: leadsCount,
    },
    // 廣告不只給原始數字，連「該停／該減／該加碼」的判斷一起算好（lib/ad-advice.js 的固定門檻），
    // 模型只負責寫成人話——預算的判斷邏輯要看得見、可被質疑，不該藏在模型裡。
    ads: adReport && { ...adReport, advice: adAdvice(adReport, { targetRoas: adReport.targetRoas || 3 }) },
    coupons: coupons && { active: coupons.filter((c) => (c.status || "active") === "active").length, anomalies: couponAnomalies(coupons, settings, now) },
    content: videos && { published_units: published.length, units_without_video: missing.length, first_missing_unit: missing[0]?.title || null },
    drafts: announcements && { announcements_unpublished: announcements.filter((a) => !a.published).length },
    upcoming: upcomingDates(settings, now),
  };
}
