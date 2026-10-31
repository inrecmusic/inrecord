// lib/handout-unit.js — 「純講義單元」：後台章節列「新增講義」建的單元，只放講義、沒有影片。
// 不另開欄位（免跑 SQL）：videos.duration 寫成 HANDOUT_UNIT_MARK 當標記；這個欄位在教室本來就顯示在單元標題下，
// 印出「講義」剛好就是要的字。parseDurationSeconds 解析不出它（回 0），進度判定不受影響。
// 教室據此把它和「影片還沒上架」分開：不變灰、不顯示預計上架、不算進影片進度。
export const HANDOUT_UNIT_MARK = "講義";

export function isHandoutUnit(v) {
  return !!v && !v.bunny_video_id && !v.vimeo_id && v.duration === HANDOUT_UNIT_MARK;
}
