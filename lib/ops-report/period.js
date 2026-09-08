// lib/ops-report/period.js — 週報期間。weeklyPeriod：台灣時間（UTC+8，無夏令）上週一 00:00 至本週一 00:00（排程用）；
// rollingPeriod：過去 7 天到現在（後台「立刻產生」用）。
const TW_OFFSET_MS = 8 * 3600 * 1000;
const DAY_MS = 86400 * 1000;
const md = (d) => { const t = new Date(d.getTime() + TW_OFFSET_MS); return `${t.getUTCMonth() + 1}/${t.getUTCDate()}`; };

export function weeklyPeriod(now = new Date()) {
  const tw = new Date(now.getTime() + TW_OFFSET_MS);            // 以 UTC 欄位表示台灣牆上時間
  const sinceMonday = (tw.getUTCDay() + 6) % 7;                  // 週一=0 … 週日=6
  const mondayTw = Date.UTC(tw.getUTCFullYear(), tw.getUTCMonth(), tw.getUTCDate() - sinceMonday);
  const end = new Date(mondayTw - TW_OFFSET_MS);
  const start = new Date(end.getTime() - 7 * DAY_MS);
  const prevStart = new Date(start.getTime() - 7 * DAY_MS);
  return { start, end, prevStart, label: `${md(start)}–${md(new Date(end.getTime() - DAY_MS))}` };
}

export function rollingPeriod(now = new Date()) {
  const end = new Date(now.getTime());
  const start = new Date(end.getTime() - 7 * DAY_MS);
  const prevStart = new Date(start.getTime() - 7 * DAY_MS);
  return { start, end, prevStart, label: `${md(start)}–${md(end)}` };
}
