// lib/dashboard.js — 儀表板圖表的純資料計算（無 React、可測）。
// 銷售趨勢分桶、付款方式/來源分布；皆只計 status==='paid' 的訂單。
// now 由呼叫端傳入（純函式不呼 Date.now，方便測試）。

const DAY_MS = 86400000;
const HOUR_MS = 3600000;
const WEEK_DAYS = ["日", "一", "二", "三", "四", "五", "六"];

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

// 各區間的桶數
function bucketCount(filter) {
  return filter === "day" ? 24 : filter === "week" ? 7 : filter === "year" ? 12 : 30;
}

// 產生空桶（label 與舊 genChartData 一致，圖表 x 軸不變）
function makeBuckets(filter, now) {
  if (filter === "day")
    return Array.from({ length: 24 }, (_, i) => {
      const h = (now.getHours() - 23 + i + 24) % 24;
      return { label: `${String(h).padStart(2, "0")}:00`, orders: 0, revenue: 0 };
    });
  if (filter === "week")
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now); d.setDate(d.getDate() - 6 + i);
      return { label: `週${WEEK_DAYS[d.getDay()]}`, orders: 0, revenue: 0 };
    });
  if (filter === "year")
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      return { label: `${d.getMonth() + 1}月`, orders: 0, revenue: 0 };
    });
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - 29 + i);
    return { label: `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`, orders: 0, revenue: 0 };
  });
}

// 時間戳對應的桶 index（不在範圍內回 -1）
function bucketIndex(t, filter, now) {
  if (filter === "day") {
    const diff = Math.floor((now.getTime() - t.getTime()) / HOUR_MS);
    return diff < 0 || diff > 23 ? -1 : 23 - diff;
  }
  if (filter === "year") {
    const diff = (now.getFullYear() * 12 + now.getMonth()) - (t.getFullYear() * 12 + t.getMonth());
    return diff < 0 || diff > 11 ? -1 : 11 - diff;
  }
  const span = filter === "week" ? 6 : 29;
  const diff = Math.floor((startOfDay(now).getTime() - startOfDay(t).getTime()) / DAY_MS);
  return diff < 0 || diff > span ? -1 : span - diff;
}

function paidOnly(orders) { return (orders || []).filter((o) => o && o.status === "paid"); }

// 銷售趨勢：回 [{label, orders, revenue}]（時間由舊到新）。
export function buildSalesTrend(orders = [], filter = "month", now = new Date()) {
  const buckets = makeBuckets(filter, now);
  for (const o of paidOnly(orders)) {
    const t = new Date(o.created_at || o.updated_at || 0);
    if (isNaN(t.getTime())) continue;
    const i = bucketIndex(t, filter, now);
    if (i < 0 || i >= buckets.length) continue;
    buckets[i].orders += 1;
    buckets[i].revenue += Number(o.amount) || 0;
  }
  return buckets;
}

const PAY_TYPE_LABELS = {
  Credit: "信用卡", credit: "信用卡", CREDIT: "信用卡",
  ATM: "ATM 轉帳", WEBATM: "網路 ATM",
  CVS: "超商代碼", CVSCOM: "超商條碼", BARCODE: "超商條碼",
};
const SOURCE_LABELS = {
  concert: "演奏會線上", wordpress: "碩樂現場", manual: "手動開通", payuni: "線上購買",
};

// 一筆訂單的「付款方式／來源」標籤：有 pay_type 用付款方式，否則退回來源（外部站台無 pay_type）。
function payLabel(o) {
  if (o.pay_type) return PAY_TYPE_LABELS[o.pay_type] || o.pay_type;
  if (o.source && SOURCE_LABELS[o.source]) return SOURCE_LABELS[o.source];
  return "未知";
}

// 付款方式/來源分布：回 [{label, count, amount}]（依筆數遞減）。可選依區間過濾。
export function buildPayDistribution(orders = [], filter = null, now = new Date()) {
  const map = new Map();
  for (const o of paidOnly(orders)) {
    if (filter) {
      const t = new Date(o.created_at || o.updated_at || 0);
      if (isNaN(t.getTime()) || bucketIndex(t, filter, now) < 0) continue;
    }
    const label = payLabel(o);
    const cur = map.get(label) || { label, count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += Number(o.amount) || 0;
    map.set(label, cur);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.amount - a.amount);
}
