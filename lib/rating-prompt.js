// lib/rating-prompt.js — 播放頁「播完一個單元就邀請評分」彈窗的顯示條件（純函式）＋本裝置次數紀錄。
// 條件：未評分、剛播完的是正課單元（試看不算）且已達完成、本裝置總共最多跳 3 次、同一天最多 2 次。
import { isTrialVideo } from "./early-access.js";

const KEY = "inrec_rating_prompt";
export const MAX_TOTAL = 3;
export const MAX_PER_DAY = 2;

const EMPTY = { total: 0, day: "", dayCount: 0 };

// 「同一天」以學員裝置的當地日期為準
export function localDay(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export function shouldPrompt({ rated, video, completed, state = EMPTY, today = localDay() } = {}) {
  if (rated || !video || !completed || isTrialVideo(video)) return false;
  if (state.total >= MAX_TOTAL) return false;
  if (state.day === today && state.dayCount >= MAX_PER_DAY) return false;
  return true;
}

export function readPromptState(storage) {
  try {
    const s = JSON.parse(storage?.getItem(KEY) || "null");
    if (!s || typeof s !== "object") return { ...EMPTY };
    return { total: Number(s.total) || 0, day: typeof s.day === "string" ? s.day : "", dayCount: Number(s.dayCount) || 0 };
  } catch { return { ...EMPTY }; }
}

export function recordPrompt(storage, today = localDay()) {
  const prev = readPromptState(storage);
  const next = { total: prev.total + 1, day: today, dayCount: prev.day === today ? prev.dayCount + 1 : 1 };
  try { storage?.setItem(KEY, JSON.stringify(next)); } catch { /* 隱私模式／被封鎖：靜默 */ }
  return next;
}
