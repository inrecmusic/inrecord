// lib/coming-soon.js — 教室側欄「預計 M/D 上架」文案的日期保險絲。
// 影片還沒掛上、但預計日（台灣時間）已經過了 → 改顯示「即將上架」，避免學員看到跳票日期。
// 日期本身仍寫在 app/classroom/watch/page.jsx 的 UNIT_COMING_SOON / CHAPTER_COMING_SOON（改期只改那裡）。
export function comingSoonLabel(label, now = new Date()) {
  const m = /預計\s*(\d{1,2})\/(\d{1,2})\s*上架/.exec(label || "");
  if (!m) return label;
  const tw = new Date(now.getTime() + 8 * 3600 * 1000); // 台灣 = UTC+8
  const todayTw = Date.UTC(tw.getUTCFullYear(), tw.getUTCMonth(), tw.getUTCDate());
  const due = Date.UTC(tw.getUTCFullYear(), Number(m[1]) - 1, Number(m[2]));
  return todayTw > due ? "即將上架" : label;
}
