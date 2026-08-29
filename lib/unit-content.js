// 由 materials / games / videos 三份清單彙整「每個單元有哪些內容項目」，
// 供播放頁右側單元欄展開時直接列出真實項目名稱。純函式、無 IO，由 bootstrap 在伺服器端呼叫。
// 只收錄至少有一項內容的單元；全課程通用講義（video_id 為 null）不掛在任何單元上。
const KIND_ORDER = ["handout", "score", "game", "assignment"];

export function buildContentItems({ materials = [], games = [], videos = [] } = {}) {
  const items = {};
  const push = (id, item) => ((items[id] ??= []).push(item));

  for (const m of materials) {
    if (!m?.video_id) continue;
    push(m.video_id, { kind: m.kind === "score" ? "score" : "handout", id: m.id, title: m.title ?? "" });
  }
  for (const g of games) {
    if (g?.video_id) push(g.video_id, { kind: "game", id: g.id, title: g.title ?? "" });
  }
  for (const v of videos) {
    if (v?.id && v.assignment_desc?.trim()) push(v.id, { kind: "assignment", id: v.id, title: "作業繳交" });
  }

  // 固定順序：先看的（講義、樂譜）、再練的（遊戲）、最後交的（作業）。
  // 位置一致，學員掃第二個單元時不用重新找。同類型內維持傳入順序（sort 為穩定排序）。
  for (const list of Object.values(items)) {
    list.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  }
  return items;
}

// 全課程總覽統計：側欄頂端「本課程共 N 支影片 · N 份講義…」用。
export function summarizeContent(itemsMap = {}, videoCount = 0) {
  const out = { videos: videoCount, handout: 0, score: 0, game: 0, assignment: 0 };
  for (const list of Object.values(itemsMap)) {
    for (const it of list) if (it?.kind in out && it.kind !== "videos") out[it.kind] += 1;
  }
  return out;
}
