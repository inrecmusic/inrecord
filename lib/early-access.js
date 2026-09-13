// 早鳥搶先看分層：只有「音樂會預購」（9/2 開課日之前付款／開通）的學員，9/2 起可跟著每週上架進度觀看；
// 9/2 起購課者分兩批放行——9/30 開放第一批（Ch1～Ch3）、10/31 完整上架（對外電子報承諾）。
// 教室仍可進、大綱可看、試看單元任何時候都可播。
// 2026-09-02 由 9/9 改為 9/2（使用者定案：早鳥只給音樂會預購者；改切點時正式 DB 67 筆付款全在 9/2 前、0 筆受影響）。
// 例外可用後台 enrollments.early_override 覆寫。
// 由 bootstrap 與 video-embed 在伺服器端呼叫；判斷依據為訂單成立時間（付款成功單）或開通時間。
export const EARLY_CUTOFF_MS = Date.parse("2026-09-01T23:59:59.999+08:00");
export const FULL_RELEASE_MS = Date.parse("2026-09-30T20:00:00+08:00");   // 第一批：Ch1～Ch3
export const SECOND_RELEASE_MS = Date.parse("2026-10-31T20:00:00+08:00"); // 第二批：全部章節

// 第一批放行的章節上限，以 chapters.sort_order 判斷。
// ⚠️ 正式庫的 chapters.sort_order 是 0-based（0＝Ch1、1＝Ch2、2＝Ch3、…、10/11＝附錄），
// 所以「Ch1～Ch3」＝ sort_order 0、1、2，上限是 2（寫成 3 會多放一章 Ch4）。
export const FIRST_BATCH_MAX_SORT = 2;

// 試看單元不受分層限制（標題以「試看」開頭為明確約定）
export function isTrialVideo(video) {
  return typeof video?.title === "string" && video.title.startsWith("試看");
}

// orders：該學員（email/grant_email）的 paid 訂單 created_at 清單；enrollments：開通紀錄 created_at 清單。
// 任一時間點在 cutoff（含）之前 → 早鳥。都沒有紀錄（理論上不會，購課守門在前）→ 保守視為非早鳥。
export function isEarlyAccess({ orderTimes = [], enrollTimes = [] } = {}, cutoffMs = EARLY_CUTOFF_MS) {
  const ts = [...orderTimes, ...enrollTimes]
    .map((t) => (typeof t === "number" ? t : Date.parse(t)))
    .filter((t) => Number.isFinite(t));
  if (!ts.length) return false;
  return Math.min(...ts) <= cutoffMs;
}

// 可播與否的唯一判斷來源：三段時間 × 早鳥/非早鳥 × 試看/正課。bootstrap（UI）與 video-embed（硬閘門）共用。
// chapterSort：該影片所屬章節的 chapters.sort_order；查不到章節（chapter_id 為 null／查詢失敗）→ 傳 undefined，對非早鳥保守擋下。
// batched=false：不帶章節資訊的舊呼叫端，退回原本兩段制（9/30 起全開），行為與改版前完全一致。
export function canPlayVideo({
  video, early, nowMs, chapterSort, batched = true,
  releaseMs = FULL_RELEASE_MS, secondReleaseMs = SECOND_RELEASE_MS,
} = {}) {
  if (early || isTrialVideo(video)) return true; // 早鳥與試看單元任何時間都放行
  if (nowMs < releaseMs) return false;           // 9/30 前：非早鳥的正課全擋
  if (!batched) return true;                     // 舊的兩段制
  if (nowMs >= secondReleaseMs) return true;     // 10/31 起：完整上架
  return Number.isFinite(chapterSort) && chapterSort <= FIRST_BATCH_MAX_SORT; // 9/30–10/31：只放第一批
}

// chapters 列表 → { 章節 id: sort_order } 查表，餵給 stripPlayback。
export function chapterSortMap(chapters) {
  return new Map((Array.isArray(chapters) ? chapters : []).map((c) => [c.id, c.sort_order]));
}

// 非早鳥尚未開放的正課影片：把可播欄位摘掉（試看單元保留）。
// 只影響「能不能播」，單元列表／標題／大綱照常回傳（側欄自然顯示「預計 M/D 上架」）。
// chapterSortById（Map 或物件）有帶才啟用分批判斷；不帶＝維持改版前的兩段制行為。
export function stripPlayback(videos, {
  early, nowMs, chapterSortById,
  releaseMs = FULL_RELEASE_MS, secondReleaseMs = SECOND_RELEASE_MS,
} = {}) {
  if (!Array.isArray(videos)) return videos;
  const batched = !!chapterSortById;
  if (early || nowMs >= (batched ? secondReleaseMs : releaseMs)) return videos;
  const sortOf = (id) => (chapterSortById instanceof Map ? chapterSortById.get(id) : chapterSortById?.[id]);
  return videos.map((v) =>
    canPlayVideo({ video: v, early, nowMs, chapterSort: batched ? sortOf(v.chapter_id) : undefined, batched, releaseMs, secondReleaseMs })
      ? v
      : { ...v, bunny_video_id: null, vimeo_id: null }
  );
}
