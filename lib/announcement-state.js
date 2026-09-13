// lib/announcement-state.js — 公告的已讀／已確認狀態，記在該裝置（localStorage）。
// storage 可注入（測試用）；null 或會丟例外（隱私模式、被封鎖）一律靜默，回初始狀態。
const KEY_SEEN  = "inrec_ann_seen_at";        // 舊版「最後打開公告清單的時間」（ISO）；只讀不寫，供逐則已讀遷移
const KEY_READ  = "inrec_ann_read";           // 已讀公告 id 陣列（逐則記錄，JSON）
const KEY_ACKED = "inrec_ann_acked";          // 已按「知道了」的重要公告 id 陣列（JSON）
const KEY_STRIP = "inrec_ann_strip_dismissed"; // 關掉提示條的公告 id

const get = (s, k) => { try { return s?.getItem(k) ?? null; } catch { return null; } };
const set = (s, k, v) => { try { s?.setItem(k, v); } catch { /* 靜默 */ } };
const parseIds = (raw) => { try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; } };

export function readAnnouncementState(storage) {
  const rawRead = get(storage, KEY_READ);
  return {
    seenAt: get(storage, KEY_SEEN),
    read: rawRead === null ? null : parseIds(rawRead), // null＝這台裝置還沒有逐則記錄（舊使用者，待遷移）
    acked: parseIds(get(storage, KEY_ACKED) || "[]"),
    stripDismissed: get(storage, KEY_STRIP),
  };
}

// 併入已讀清單（會先讀回現有值再合併，多分頁同開也不會互相蓋掉）；回傳合併後的完整清單。
export function writeRead(storage, ids) {
  const cur = readAnnouncementState(storage).read || [];
  const next = [...new Set([...cur, ...(ids || [])])];
  set(storage, KEY_READ, JSON.stringify(next));
  return next;
}

export function writeAck(storage, id) {
  const { acked } = readAnnouncementState(storage);
  if (!acked.includes(id)) set(storage, KEY_ACKED, JSON.stringify([...acked, id]));
}

export function writeStripDismissed(storage, id) { set(storage, KEY_STRIP, id); }
