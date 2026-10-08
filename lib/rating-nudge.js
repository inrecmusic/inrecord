// lib/rating-nudge.js — 儀表板「給課程評分」推力卡片的顯示條件（純函式）＋本裝置關閉旗標。
// 條件：未評分、第 1 章（sort_order 最小）的正課單元全部 completed（試看不算）、本裝置沒關過。
import { isTrialVideo } from "./early-access.js";

const KEY = "inrec_rating_nudge_dismissed";

export function shouldNudge({ rated, chapters = [], videos = [], progress = [], dismissed = false } = {}) {
  if (rated || dismissed) return false;
  if (!chapters.length) return false;
  const first = [...chapters].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];
  const course = videos.filter((v) => v.chapter_id === first.id && !isTrialVideo(v));
  if (!course.length) return false; // 第 1 章沒有正課（只有試看）不算完成
  const doneIds = new Set(progress.filter((p) => p.completed).map((p) => p.video_id));
  return course.every((v) => doneIds.has(v.id));
}

export function readNudgeDismissed(storage) {
  try { return storage?.getItem(KEY) === "1"; } catch { return false; }
}

export function writeNudgeDismissed(storage) {
  try { storage?.setItem(KEY, "1"); } catch { /* 隱私模式／被封鎖：靜默 */ }
}
