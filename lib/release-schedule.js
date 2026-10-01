// lib/release-schedule.js — 課程上架時程（單一權威來源；儀表板與播放頁側欄共用）
//
// CHAPTER_RELEASE_DATES：各章「預計上架日」（台灣日期）。改期只改這裡。
// 非早鳥實際看得到的時間另由 lib/early-access.js 的 FULL_RELEASE_MS／SECOND_RELEASE_MS 控管（兩者不同層次）。
export const CHAPTER_RELEASE_DATES = {
  // Ch3 由 9/23 併到 9/30（2026-09-22 調整）；9/30 只上到 Ch3。
  // Ch4 仍在修改，由 9/30 延到 10/7，與 Ch5 同一天（2026-09-27 調整）；Ch5 之後各章不變。
  2: "2026-09-23", 3: "2026-09-30", 4: "2026-10-07", 5: "2026-10-07",
  6: "2026-10-14", 7: "2026-10-21", 8: "2026-10-28", 9: "2026-10-31", 10: "2026-10-31",
};
// 沒在上表的章（附錄）與尚未上傳的單元：正式開課日
export const DEFAULT_RELEASE_DATE = "2026-10-31";

// 課綱規劃的各章互動遊戲（依章節標題 ChN 對應）。after＝接在哪個單元之後（單元標題開頭編號）。
// 播放頁側欄：上傳後同名遊戲掛上任一單元，規劃列就自動消失（includes 比對，容忍副標）。
export const PLANNED_CHAPTER_GAMES = {
  1:  [{ name: "Do 給你找",       after: "1-2" }],
  2:  [{ name: "音名快閃",        after: "2-1" }, { name: "唱名小達人", after: "2-2" }, { name: "音名唱名連連看", after: "2-3" }],
  3:  [{ name: "簡譜挑戰",        after: "3-2" }, { name: "五線譜挑戰", after: "3-3" }, { name: "對照翻翻樂", after: "3-5" }],
  4:  [{ name: "節奏打點師",      after: "4-5" }],
  6:  [{ name: "和弦辨識家",      after: "6-4" }],
  7:  [{ name: "情緒調色盤",      after: "7-1" }],
  8:  [{ name: "分解和弦連連看",  after: "8-4" }],
  9:  [{ name: "和弦神預測",      after: "9-3" }],
  10: [{ name: "自由創作坊",      after: "10-6" }],
};

// "2026-09-30" → "9/30"（側欄與儀表板的短日期）
export function mdLabel(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ""));
  return m ? `${Number(m[2])}/${Number(m[3])}` : "";
}

// 章節標題 "Ch2 音符的語言—音名與唱名" → 2；附錄／解析不到 → NaN
export function chapterNum(title) {
  return Number((String(title || "").match(/^Ch(\d+)/i) || [])[1]);
}

// 單元標題開頭的編號："1-2 尋找起始音 Do" → "1-2"
export function unitNo(title) {
  return String(title || "").trim().split(/\s+/)[0];
}
