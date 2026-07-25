// lib/attribution-report.js — 後臺來源歸因聚合（純函式）
export function groupBySource(orders) {
  const map = new Map();
  for (const o of orders || []) {
    const a = o.attribution || null;
    const key = a?.utm_source
      ? `${a.utm_source}${a.utm_campaign ? " / " + a.utm_campaign : ""}`
      : "直接／自然";
    const cur = map.get(key) || { source: key, orders: 0, revenue: 0 };
    cur.orders += 1;
    cur.revenue += Number(o.amount) || 0;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}
