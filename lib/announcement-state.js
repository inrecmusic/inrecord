// lib/announcement-state.js — 公告的已讀／已確認狀態，記在該裝置（localStorage）。
// storage 可注入（測試用）；null 或會丟例外（隱私模式、被封鎖）一律靜默，回初始狀態。
const KEY_SEEN  = "inrec_ann_seen_at";        // 最後打開公告清單的時間（ISO）
const KEY_ACKED = "inrec_ann_acked";          // 已按「知道了」的重要公告 id 陣列（JSON）
const KEY_STRIP = "inrec_ann_strip_dismissed"; // 關掉提示條的公告 id

const get = (s, k) => { try { return s?.getItem(k) ?? null; } catch { return null; } };
const set = (s, k, v) => { try { s?.setItem(k, v); } catch { /* 靜默 */ } };

export function readAnnouncementState(storage) {
  let acked = [];
  try { const v = JSON.parse(get(storage, KEY_ACKED) || "[]"); if (Array.isArray(v)) acked = v; } catch { acked = []; }
  return { seenAt: get(storage, KEY_SEEN), acked, stripDismissed: get(storage, KEY_STRIP) };
}

export function writeSeen(storage, iso) { set(storage, KEY_SEEN, iso); }

export function writeAck(storage, id) {
  const { acked } = readAnnouncementState(storage);
  if (!acked.includes(id)) set(storage, KEY_ACKED, JSON.stringify([...acked, id]));
}

export function writeStripDismissed(storage, id) { set(storage, KEY_STRIP, id); }
