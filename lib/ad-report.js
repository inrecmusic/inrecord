// lib/ad-report.js — 廣告成效：ROAS join + 衍生指標（純函式，可測）
export function normKey(s) { return String(s == null ? "" : s).trim().toLowerCase(); }

const div = (a, b) => (b ? a / b : 0);

export function buildAdReport({ insights = [], paidOrders = [], targetRoas = 3 } = {}) {
  // insights 先彙總（才知道有哪些活動），並記每日花費
  const byCamp = new Map();          // campaign_id -> agg
  const spendByDay = new Map();      // date -> spend
  for (const r of insights) {
    const id = String(r.campaign_id);
    const a = byCamp.get(id) || { campaign_id: id, campaign_name: r.campaign_name, spend: 0, impressions: 0, clicks: 0, reach: 0, freqSum: 0, freqN: 0, meta_conversions: 0, meta_conversion_value: 0, days: new Map() };
    a.campaign_name = r.campaign_name || a.campaign_name;
    a.spend += Number(r.spend) || 0;
    a.impressions += Number(r.impressions) || 0;
    a.clicks += Number(r.clicks) || 0;
    a.reach += Number(r.reach) || 0;
    a.freqSum += Number(r.frequency) || 0; a.freqN += 1;
    a.meta_conversions += Number(r.meta_conversions) || 0;
    a.meta_conversion_value += Number(r.meta_conversion_value) || 0;
    const day = String(r.date).slice(0, 10);
    a.days.set(day, (a.days.get(day) || 0) + (Number(r.spend) || 0));
    byCamp.set(id, a);
    spendByDay.set(day, (spendByDay.get(day) || 0) + (Number(r.spend) || 0));
  }
  // 已知活動名（正規化）——只有「對得上某活動」的訂單才算廣告營收，讓全報表口徑一致
  const known = new Set([...byCamp.values()].map((a) => normKey(a.campaign_name)));

  // 訂單依正規化 utm_campaign 分組（未帶 utm 或對不上活動者一律不計）
  const ordByCamp = new Map();      // normKey -> { orders, revenue }
  const ordByCampDay = new Map();   // normKey|date -> revenue
  const revByDay = new Map();       // date -> revenue（廣告可對上者）
  for (const o of paidOrders) {
    const camp = normKey(o?.attribution?.utm_campaign);
    if (!camp || !known.has(camp)) continue;
    const amt = Number(o.amount) || 0;
    const day = String(o.created_at || "").slice(0, 10);
    const g = ordByCamp.get(camp) || { orders: 0, revenue: 0 };
    g.orders += 1; g.revenue += amt; ordByCamp.set(camp, g);
    ordByCampDay.set(camp + "|" + day, (ordByCampDay.get(camp + "|" + day) || 0) + amt);
    if (day) revByDay.set(day, (revByDay.get(day) || 0) + amt);
  }

  const statusOf = (roas) => roas >= targetRoas ? "good" : (roas >= 1 ? "warn" : "bad");
  const last7 = [...spendByDay.keys()].sort().slice(-7);

  const campaigns = [...byCamp.values()].map((a) => {
    const key = normKey(a.campaign_name);
    const ord = ordByCamp.get(key) || { orders: 0, revenue: 0 };
    const trueRoas = div(ord.revenue, a.spend);
    const trend = last7.map((d) => {
      const s = a.days.get(d) || 0;
      const rev = ordByCampDay.get(key + "|" + d) || 0;
      return Number(div(rev, s).toFixed(2));
    });
    return {
      campaign_id: a.campaign_id, campaign_name: a.campaign_name,
      spend: a.spend, impressions: a.impressions, clicks: a.clicks, reach: a.reach,
      frequency: div(a.freqSum, a.freqN),
      ctr: div(a.clicks, a.impressions) * 100,
      cpc: div(a.spend, a.clicks),
      cpm: div(a.spend, a.impressions) * 1000,
      cvr: div(ord.orders, a.clicks) * 100,
      cpa: div(a.spend, ord.orders),
      orders: ord.orders, revenue: ord.revenue,
      metaConversions: a.meta_conversions,
      metaConversionValue: a.meta_conversion_value,
      metaRoas: div(a.meta_conversion_value, a.spend),
      trueRoas, status: statusOf(trueRoas), trend,
    };
  }).sort((x, y) => y.spend - x.spend);

  const sum = (f) => campaigns.reduce((s, c) => s + f(c), 0);
  const tSpend = sum((c) => c.spend), tImp = sum((c) => c.impressions), tClicks = sum((c) => c.clicks);
  const tReach = sum((c) => c.reach);
  const tMetaVal = sum((c) => c.metaConversionValue), tMetaConv = sum((c) => c.metaConversions);
  // 營收/訂單由訂單端加總（每筆只算一次）——避免同名不同 id 活動被 sum(c.revenue) 重複計，且與 dailySeries 口徑一致
  const tOrders = [...ordByCamp.values()].reduce((s, g) => s + g.orders, 0);
  const tRev = [...ordByCamp.values()].reduce((s, g) => s + g.revenue, 0);
  const totals = {
    spend: tSpend, impressions: tImp, clicks: tClicks, reach: tReach,
    frequency: div(tImp, tReach), ctr: div(tClicks, tImp) * 100,
    cpc: div(tSpend, tClicks), cpm: div(tSpend, tImp) * 1000,
    cvr: div(tOrders, tClicks) * 100, cpa: div(tSpend, tOrders),
    orders: tOrders, revenue: tRev, metaConversions: tMetaConv,
    trueRoas: div(tRev, tSpend), metaRoas: div(tMetaVal, tSpend),
  };

  const paid = campaigns.filter((c) => c.spend > 0);
  const best = paid.length ? paid.reduce((a, b) => (b.trueRoas > a.trueRoas ? b : a)) : null;
  const worst = paid.length ? paid.reduce((a, b) => (b.trueRoas < a.trueRoas ? b : a)) : null;

  const dailySeries = [...new Set([...spendByDay.keys(), ...revByDay.keys()])].sort()
    .map((d) => ({ date: d, spend: spendByDay.get(d) || 0, revenue: revByDay.get(d) || 0 }));

  const allocation = [...campaigns].sort((x, y) => y.spend - x.spend)
    .map((c) => ({ campaign_name: c.campaign_name, spend: c.spend, pct: div(c.spend, tSpend) * 100, status: c.status }));

  const funnel = { impressions: tImp, clicks: tClicks, purchases: tOrders };

  return { totals, campaigns, best, worst, dailySeries, allocation, funnel, configured: campaigns.length > 0 };
}
