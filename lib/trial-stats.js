// lib/trial-stats.js — 試看領取的每日統計（純函式，可測）。
//
// 一次領取＝一封試看信。email_log 記的是「寄出這個動作」，所以：
//   sent   ＝當天成功寄出的封數（含同一人重複領取）
//   people ＝當天不重複的信箱數（真正的人數）
//   failed ＝寄送失敗（信箱打錯、被退信），這個數字大代表落地頁的輸入該檢查
// 日期一律用台灣時間切，否則凌晨的領取會被算到前一天。
const TW_OFFSET_MS = 8 * 3600 * 1000;
const twDay = (iso) => {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? new Date(t + TW_OFFSET_MS).toISOString().slice(0, 10) : null;
};

export function buildTrialStats(rows = [], { days = 30, nowMs = Date.now() } = {}) {
  const byDay = new Map();
  const allPeople = new Set();
  let sent = 0, failed = 0;

  for (const r of rows || []) {
    const day = twDay(r?.created_at);
    if (!day) continue;
    const g = byDay.get(day) || { day, sent: 0, failed: 0, emails: new Set() };
    if (r.status === "sent") {
      g.sent += 1; sent += 1;
      const e = String(r.to_email || "").trim().toLowerCase();
      if (e) { g.emails.add(e); allPeople.add(e); }
    } else {
      g.failed += 1; failed += 1;
    }
    byDay.set(day, g);
  }

  // 補齊沒有領取的日子，圖表才不會把空白日壓縮掉、看起來每天都有人
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(nowMs + TW_OFFSET_MS - i * 86400_000).toISOString().slice(0, 10);
    const g = byDay.get(day);
    series.push({ day, sent: g?.sent || 0, people: g?.emails.size || 0, failed: g?.failed || 0 });
  }

  const last7 = series.slice(-7).reduce((s, d) => s + d.people, 0);
  const prev7 = series.slice(-14, -7).reduce((s, d) => s + d.people, 0);
  return {
    series,
    totals: { sent, failed, people: allPeople.size },
    last7,
    prev7,
    // 變化率：前一週是 0 的時候不給百分比（會變成無限大），由前端顯示「—」
    changePct: prev7 > 0 ? Math.round(((last7 - prev7) / prev7) * 100) : null,
  };
}
