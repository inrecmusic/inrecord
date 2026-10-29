// lib/score/timeline.js — v2 模型 → 雙手播放時間軸（純函式可測）
//
// 速度一律以「四分音符 BPM」計（6/8 也一樣，節拍器每附點四分一下）。
// 事件時間（秒）已含預備拍；連結線合併成一個事件，segs 記各段音符 id 與起點，
// 讓高亮在第二段時亮第二段的音符（五線譜／簡譜上是兩個符頭）。

export const DEFAULT_BPM = 84;
const EPS = 1e-6;

const nominalLength = (m) => (m.time.beats * 4) / m.time.beatType;
const isCompound = (t) => t.beatType === 8 && t.beats % 3 === 0 && t.beats > 3;
const clickUnit = (t) => (isCompound(t) ? 1.5 : 4 / t.beatType);

// 展開 |: :|（repeatTimes）與第一／第二結尾後的演奏順序（小節 index）；D.S.／Coda 不展開
export function playOrder(model) {
  const ms = model.measures;
  const order = [];
  let start = 0;
  let pass = 1;
  let prevHadEnding = false;
  let i = 0;
  while (i < ms.length && order.length < ms.length * 20) {
    const m = ms[i];
    if (m.repeatStart && i !== start) {
      start = i;
      pass = 1;
    }
    if (!m.ending && prevHadEnding) pass = 1; // 離開結尾括號
    prevHadEnding = !!m.ending;
    if (m.ending && !m.ending.numbers.includes(pass)) {
      if (m.repeatEnd) start = i + 1; // 跳過的第一結尾：之後的反覆從它後面算
      i++;
      continue;
    }
    order.push(i);
    if (m.repeatEnd && pass < (m.repeatTimes || 2)) {
      pass++;
      i = start;
      prevHadEnding = false;
      continue;
    }
    if (m.repeatEnd) {
      start = i + 1;
      pass = 1;
    }
    i++;
  }
  return order;
}

export function buildPlayback(model, { bpm = DEFAULT_BPM, hands = { rh: true, lh: true }, loop = null, countIn = false, metronome = false } = {}) {
  const spb = 60 / (bpm || DEFAULT_BPM);
  const ms = model.measures;
  const order = loop
    ? Array.from({ length: Math.max(0, loop.to - loop.from + 1) }, (_, k) => loop.from + k).filter((i) => ms[i])
    : playOrder(model);

  const clicks = [];
  let countInSec = 0;
  if (countIn && order.length) {
    const ref = order.map((i) => ms[i]).find((m) => !m.implicit) || ms[order[0]];
    const len = nominalLength(ref);
    const unit = clickUnit(ref.time);
    for (let p = 0; p < len - EPS; p += unit) clicks.push({ at: p * spb, accent: p === 0 });
    countInSec = len * spb;
  }

  const byMeasure = new Map();
  for (const n of model.notes) {
    if (!byMeasure.has(n.measure)) byMeasure.set(n.measure, []);
    byMeasure.get(n.measure).push(n);
  }

  const events = [];
  const measureTimes = [];
  const openTies = new Map(); // `${staff}:${midi}` → 事件
  let t = countInSec;
  for (const mi of order) {
    const m = ms[mi];
    measureTimes.push({ measure: mi, at: t });
    if (metronome) {
      const unit = clickUnit(m.time);
      const offset = m.implicit ? Math.max(0, nominalLength(m) - m.length) : 0;
      for (let k = Math.ceil((offset - EPS) / unit); k * unit - offset < m.length - EPS; k++) {
        const p = k * unit - offset;
        clicks.push({ at: t + p * spb, accent: Math.abs(k * unit) < EPS });
      }
    }
    for (const n of byMeasure.get(mi) || []) {
      if (n.rest || n.midi === null) continue;
      if ((n.staff === 1 && !hands.rh) || (n.staff === 2 && !hands.lh)) continue;
      const at = t + n.onset * spb;
      const dur = n.dur * spb;
      const key = `${n.staff}:${n.midi}`;
      const open = n.tieStop ? openTies.get(key) : null;
      if (open && Math.abs(open.at + open.dur - at) < EPS) {
        open.segs.push({ id: n.id, at });
        open.dur += dur;
        if (!n.tieStart) openTies.delete(key);
        continue;
      }
      const ev = { midi: n.midi, staff: n.staff, at, dur, segs: [{ id: n.id, at }] };
      events.push(ev);
      if (n.tieStart) openTies.set(key, ev);
      else openTies.delete(key);
    }
    t += m.length * spb;
  }
  events.sort((a, b) => a.at - b.at || a.midi - b.midi);
  clicks.sort((a, b) => a.at - b.at);
  return { events, clicks, duration: t, countIn: countInSec, measureTimes };
}

// t 秒時正在響的音符 id（連結線取涵蓋 t 的那一段）
export function activeIdsAt(playback, t) {
  const ids = new Set();
  for (const e of playback.events) {
    if (e.at > t + EPS) break;
    if (t >= e.at - EPS && t < e.at + e.dur - EPS) {
      let seg = e.segs[0];
      for (const s of e.segs) if (s.at <= t + EPS) seg = s;
      ids.add(seg.id);
    }
  }
  return ids;
}
