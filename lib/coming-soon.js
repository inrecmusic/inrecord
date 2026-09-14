// lib/coming-soon.js — 教室側欄「預計 M/D 上架」文案的純函式。
// 日期本身仍寫在 app/classroom/watch/page.jsx 的 UNIT_COMING_SOON / CHAPTER_COMING_SOON（改期只改那裡）。
import { FULL_RELEASE_MS } from "./early-access.js";

// 日期保險絲：影片還沒掛上、但預計日（台灣時間）已經過了 → 改顯示「即將上架」，避免學員看到跳票日期。
export function comingSoonLabel(label, now = new Date()) {
  const m = /預計\s*(\d{1,2})\/(\d{1,2})\s*上架/.exec(label || "");
  if (!m) return label;
  const tw = new Date(now.getTime() + 8 * 3600 * 1000); // 台灣 = UTC+8
  const todayTw = Date.UTC(tw.getUTCFullYear(), tw.getUTCMonth(), tw.getUTCDate());
  const due = Date.UTC(tw.getUTCFullYear(), Number(m[1]) - 1, Number(m[2]));
  return todayTw > due ? "即將上架" : label;
}

// 非早鳥（9/2 起購課，early === false）看到的日期要是「他實際看得到」的批次日，不是章節實際上架日
//（章節日期表對非早鳥太樂觀：Ch2 的 9/23 是早鳥日，他要等 9/30；Ch5 的 10/7 他要等 10/31）。
// 規則與教室公告一致：9/30 20:00（FULL_RELEASE_MS）前 Ch1～Ch3 一律第一批（9/30）；Ch4 以後與附錄一律第二批（10/31）。
// 早鳥（true）與完整上架後（bootstrap 不帶旗標＝undefined）不覆寫；9/30 起 Ch1～Ch3 已放行，沒影片的單元回歸章節日期表。
// 回傳 "first" | "second" | null，文案由呼叫端決定（日期字串只留在 page.jsx）。
export const FIRST_BATCH_LAST_CH = 3;
export function releaseBatchFor(chNum, early, nowMs = Date.now()) {
  if (early !== false) return null;
  if (Number.isFinite(chNum) && chNum <= FIRST_BATCH_LAST_CH) return nowMs < FULL_RELEASE_MS ? "first" : null;
  return "second";
}
