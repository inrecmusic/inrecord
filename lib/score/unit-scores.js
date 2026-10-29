// lib/score/unit-scores.js — 學員端讀取：舊 ABC 曲（scores.video_id）與 v2 曲目（score_units 多對多）合併（純函式）
// v2 的欄位或表不存在（supabase-scores-v2.sql 還沒跑）時一律降級成只有舊 ABC，不讓樂譜分頁消失或 500。

const byOrder = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.title || "").localeCompare(String(b.title || ""), "zh-Hant");

export function mergeUnitScores(legacyRows, linkedRows) {
  const seen = new Set();
  const out = [];
  for (const r of Array.isArray(legacyRows) ? legacyRows : []) {
    if (!r?.id || seen.has(r.id) || !r.abc) continue;
    seen.add(r.id);
    out.push({ id: r.id, video_id: r.video_id ?? null, title: r.title, subtitle: r.subtitle ?? null, format: "abc", abc: r.abc, sort_order: r.sort_order ?? 0 });
  }
  for (const r of Array.isArray(linkedRows) ? linkedRows : []) {
    if (!r?.id || seen.has(r.id) || !r.musicxml) continue;
    seen.add(r.id);
    out.push({ id: r.id, title: r.title, subtitle: r.subtitle ?? null, format: "musicxml", musicxml: r.musicxml, version: r.version ?? 1, sort_order: r.sort_order ?? 0 });
  }
  return out.sort(byOrder);
}

// 欄位／表／關聯不存在（含 PostgREST schema cache 訊息）
export function isMissingRelation(error) {
  if (!error) return false;
  if (["42703", "42P01", "PGRST200", "PGRST204", "PGRST205"].includes(error.code)) return true;
  return /does not exist|schema cache|could not find/i.test(error.message || "");
}

// bootstrap 側欄用：{ id, video_id, title }[]；v2 查詢失敗就只回舊 ABC
export function sidebarScores(legacyRes, linkRes) {
  const legacy = (legacyRes?.data || []).filter((r) => r?.video_id).map((r) => ({ id: r.id, video_id: r.video_id, title: r.title }));
  if (linkRes?.error || !Array.isArray(linkRes?.data)) return legacy;
  const v2 = linkRes.data
    .filter((r) => r?.video_id && r.scores?.id)
    .map((r) => ({ id: r.scores.id, video_id: r.video_id, title: r.scores.title }));
  return [...legacy, ...v2];
}
