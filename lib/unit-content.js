// 由 materials / games / videos 三份清單彙整「每個單元有哪些內容」的旗標，
// 供播放頁右側單元欄直接查表顯示 icon。純函式、無 IO，由 bootstrap 在伺服器端呼叫。
// 只收錄至少有一項內容的單元；全課程通用講義（video_id 為 null）不掛在任何單元上。
export function buildContentFlags({ materials = [], games = [], videos = [] } = {}) {
  const flags = {};
  const at = (id) => (flags[id] ??= { handout: false, score: false, game: false, assignment: false });

  for (const m of materials) {
    if (!m?.video_id) continue;
    at(m.video_id)[m.kind === "score" ? "score" : "handout"] = true;
  }
  for (const g of games) {
    if (g?.video_id) at(g.video_id).game = true;
  }
  for (const v of videos) {
    if (v?.id && v.assignment_desc?.trim()) at(v.id).assignment = true;
  }
  return flags;
}
