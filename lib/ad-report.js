// lib/ad-report.js — 廣告成效：ROAS join + 衍生指標（純函式，可測）
export function normKey(s) { return String(s == null ? "" : s).trim().toLowerCase(); }

const div = (a, b) => (b ? a / b : 0);

// ad_insights.date 是廣告帳戶時區（台灣 UTC+8，無夏令）的日期，orders.created_at 是 UTC。
// 直接切 ISO 前十碼會把台灣 00:00–08:00 的訂單算到前一天，日趨勢的花費與營收整體錯位一天。
// 換算方式同 lib/ops-report/period.js：先加 8 小時再取 UTC 日期欄位。
const TW_OFFSET_MS = 8 * 3600 * 1000;
export function twDay(iso) {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? new Date(t + TW_OFFSET_MS).toISOString().slice(0, 10) : "";
}

export function buildAdReport({ insights = [], paidOrders = [], targetRoas = 3 } = {}) {
  // insights 先彙總（才知道有哪些活動），並記每日花費
  const byCamp = new Map();          // campaign_id -> agg
  const spendByDay = new Map();      // date -> spend
  const idByKey = new Map();         // normKey(campaign_id) -> campaign_id
  const idsByName = new Map();       // normKey(campaign_name) -> Set(campaign_id)；同名不同 id 會有多個
  let allFreqSum = 0, allFreqN = 0;
  for (const r of insights) {
    const id = String(r.campaign_id);
    const a = byCamp.get(id) || { campaign_id: id, campaign_name: r.campaign_name, spend: 0, impressions: 0, clicks: 0, reachDaySum: 0, freqSum: 0, freqN: 0, meta_conversions: 0, meta_conversion_value: 0, days: new Map() };
    a.campaign_name = r.campaign_name || a.campaign_name;
    a.spend += Number(r.spend) || 0;
    a.impressions += Number(r.impressions) || 0;
    a.clicks += Number(r.clicks) || 0;
    // ⚠️ 每日 reach 是「當天去重人數」，跨日加總不等於區間去重觸及（同一個人天天看就被算很多次、嚴重高估）。
    // 因此只當「每日觸及加總」用，絕不拿來算頻率。真正的區間觸及要另外向 Meta 查帳戶層級區間值。
    a.reachDaySum += Number(r.reach) || 0;
    a.freqSum += Number(r.frequency) || 0; a.freqN += 1;
    allFreqSum += Number(r.frequency) || 0; allFreqN += 1;
    a.meta_conversions += Number(r.meta_conversions) || 0;
    a.meta_conversion_value += Number(r.meta_conversion_value) || 0;
    const day = String(r.date).slice(0, 10);   // ad_insights.date 本來就是帳戶時區的日，不用換算
    a.days.set(day, (a.days.get(day) || 0) + (Number(r.spend) || 0));
    byCamp.set(id, a);
    spendByDay.set(day, (spendByDay.get(day) || 0) + (Number(r.spend) || 0));
    idByKey.set(normKey(id), id);
    const nk = normKey(r.campaign_name);
    if (nk) idsByName.set(nk, (idsByName.get(nk) || new Set()).add(id));
  }

  // 訂單那側只有 utm_campaign 字串，對應策略（依序）：
  // ① utm 就是 campaign_id（投放時用 Meta 的 {{campaign.id}} 巨集）→ 直接用 id 對，活動改名也不會斷。
  // ② 否則用正規化活動名對；期間內出現過的每個名字都進索引，期間內改過名的舊訂單一樣對得上。
  // ③ 同名不同 id 無從分辨 → 不歸給任何單一活動（否則每個同名活動都認列全額、trueRoas 灌水），
  //    但仍計入 totals／dailySeries，口徑與舊版一致（對得上某活動的訂單，每筆只算一次）。
  const matchOrder = (utm) => {
    const key = normKey(utm);
    if (!key) return null;
    if (idByKey.has(key)) return { id: idByKey.get(key), name: key };
    const ids = idsByName.get(key);
    if (!ids) return null;
    return { id: ids.size === 1 ? [...ids][0] : null, name: key };
  };

  const ordByCamp = new Map();       // campaign_id -> { orders, revenue }
  const ordByCampDay = new Map();    // campaign_id|date -> revenue
  const revByDay = new Map();        // date -> revenue（廣告可對上者）
  const ambiguousByName = new Map(); // normKey(活動名) -> { orders, revenue }（同名歧義、未歸給活動）
  let tOrders = 0, tRev = 0;
  for (const o of paidOrders) {
    const m = matchOrder(o?.attribution?.utm_campaign);
    if (!m) continue;
    const amt = Number(o.amount) || 0;
    const day = twDay(o.created_at);
    tOrders += 1; tRev += amt;
    if (day) revByDay.set(day, (revByDay.get(day) || 0) + amt);
    if (!m.id) {
      const g = ambiguousByName.get(m.name) || { orders: 0, revenue: 0 };
      g.orders += 1; g.revenue += amt; ambiguousByName.set(m.name, g);
      continue;
    }
    const g = ordByCamp.get(m.id) || { orders: 0, revenue: 0 };
    g.orders += 1; g.revenue += amt; ordByCamp.set(m.id, g);
    ordByCampDay.set(m.id + "|" + day, (ordByCampDay.get(m.id + "|" + day) || 0) + amt);
  }

  const statusOf = (roas) => roas >= targetRoas ? "good" : (roas >= 1 ? "warn" : "bad");
  const last7 = [...spendByDay.keys()].sort().slice(-7);

  const campaigns = [...byCamp.values()].map((a) => {
    const ord = ordByCamp.get(a.campaign_id) || { orders: 0, revenue: 0 };
    const trueRoas = div(ord.revenue, a.spend);
    const trend = last7.map((d) => {
      const s = a.days.get(d) || 0;
      const rev = ordByCampDay.get(a.campaign_id + "|" + d) || 0;
      return Number(div(rev, s).toFixed(2));
    });
    return {
      campaign_id: a.campaign_id, campaign_name: a.campaign_name,
      spend: a.spend, impressions: a.impressions, clicks: a.clicks,
      reachDaySum: a.reachDaySum,
      reach: a.reachDaySum,                  // 舊欄位別名（＝每日觸及加總，不是區間去重觸及），後台表格還在讀
      frequency: div(a.freqSum, a.freqN),    // 每日頻率平均（Meta 每列自帶），不是區間頻率
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
  const tReachDaySum = sum((c) => c.reachDaySum);
  const tMetaVal = sum((c) => c.metaConversionValue), tMetaConv = sum((c) => c.metaConversions);
  // 營收/訂單在訂單迴圈就加總（每筆只算一次）——同名活動不會重複計，且與 dailySeries 口徑一致
  const totals = {
    spend: tSpend, impressions: tImp, clicks: tClicks,
    reachDaySum: tReachDaySum, reach: tReachDaySum,
    frequency: div(allFreqSum, allFreqN),   // 每日頻率平均；不能用 曝光÷觸及加總（觸及被高估→頻率被嚴重低估）
    ctr: div(tClicks, tImp) * 100,
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

  // 同名不同 id 導致無法歸戶的營收（有值代表活動命名撞名，建議改用 {{campaign.id}} 當 utm_campaign）
  const ambiguous = [...ambiguousByName.entries()].map(([campaign_name, g]) => ({ campaign_name, ...g }));

  return { totals, campaigns, best, worst, dailySeries, allocation, funnel, ambiguous, configured: campaigns.length > 0 };
}
