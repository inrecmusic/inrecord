// 早鳥搶先看分層：9/9（含）前購課的學員，9/2 起可跟著每週上架進度觀看；
// 9/10 起購課者一律等到 9/30 正式上架才開放正課影片（教室仍可進、大綱可看、試看單元可播）。
// 由 bootstrap 與 video-embed 在伺服器端呼叫；判斷依據為訂單成立時間（付款成功單）或開通時間。
export const EARLY_CUTOFF_MS = Date.parse("2026-09-09T23:59:59.999+08:00");
export const FULL_RELEASE_MS = Date.parse("2026-09-30T20:00:00+08:00");

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

// 9/30 正式上架前、非早鳥：把正課影片的可播欄位摘掉（試看單元保留）。
// 只影響「能不能播」，單元列表／標題／大綱照常回傳（側欄自然顯示「預計 9/30 上架」）。
export function stripPlayback(videos, { early, nowMs, releaseMs = FULL_RELEASE_MS } = {}) {
  if (early || nowMs >= releaseMs || !Array.isArray(videos)) return videos;
  return videos.map((v) =>
    isTrialVideo(v) ? v : { ...v, bunny_video_id: null, vimeo_id: null }
  );
}
