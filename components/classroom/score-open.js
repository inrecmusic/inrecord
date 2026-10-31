// components/classroom/score-open.js — 互動樂譜「在下方看／整頁開啟」的共用小工具
//
// 學員點樂譜時可選在影片下方的分頁看，或換頁到 /classroom/score 看 A4 整頁（同一個分頁，不另開新分頁）。
// 勾了「記住我的選擇」就存在這台瀏覽器（localStorage），之後點樂譜直接照做；整頁開啟後按左上角返回回到影片。

export const SCORE_OPEN_PREF_KEY = "inrec-score-open"; // "inline" | "page"
export const SCORE_FROM_KEY = "inrec-score-from"; // sessionStorage：從影片頁換過來的，返回鈕用上一頁

export function scorePageUrl(videoId, scoreId) {
  const q = new URLSearchParams({ v: videoId });
  if (scoreId) q.set("s", scoreId);
  return `/classroom/score?${q}`;
}

export function getScoreOpenPref() {
  try {
    const v = localStorage.getItem(SCORE_OPEN_PREF_KEY);
    return v === "inline" || v === "page" ? v : null;
  } catch {
    return null;
  }
}

export function setScoreOpenPref(v) {
  try {
    if (v) localStorage.setItem(SCORE_OPEN_PREF_KEY, v);
    else localStorage.removeItem(SCORE_OPEN_PREF_KEY);
  } catch {
    /* 無痕模式等 */
  }
}

export function markFromWatch() {
  try {
    sessionStorage.setItem(SCORE_FROM_KEY, "watch");
  } catch {
    /* 無痕模式等 */
  }
}

export function cameFromWatch() {
  try {
    return sessionStorage.getItem(SCORE_FROM_KEY) === "watch";
  } catch {
    return false;
  }
}
