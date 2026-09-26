// lib/score/playback.js — 模型 → 播放事件表（純函式可測）
//
// 兩種譜共用同一組音符編號，所以播放高亮只要對 index 就好，不必各寫一套。
// 連音線（C- C）合併成一個聲音、兩段時值相加。
export const DEFAULT_TEMPO = 84; // 沒寫 Q: 時的預設速度（四分音符 = 84，入門曲好跟）

// model → [{ index, midi, at, dur }]（秒），以及總長度
export function buildTimeline(model, { tempo, rate = 1 } = {}) {
  const bpm = Math.max(20, Math.min(240, tempo || model?.tempo || DEFAULT_TEMPO)) * (rate || 1);
  const secPerBeat = 60 / bpm;
  const events = [];
  let t = 0, pending = null;
  for (const m of model?.measures || []) {
    for (const n of m.notes) {
      const dur = n.beats * secPerBeat;
      if (n.rest) { if (pending) { events.push(pending); pending = null; } t += dur; continue; }
      if (pending && pending.midi === n.midi) { pending.dur += dur; }   // 接續前一個連音
      else { if (pending) events.push(pending); pending = { index: n.index, midi: n.midi, at: t, dur }; }
      if (!n.tied) { events.push(pending); pending = null; }
      t += dur;
    }
  }
  if (pending) events.push(pending);
  return { events, duration: t, bpm };
}

// MIDI 音高 → 頻率（A4=440）
export const midiToFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// 目前時間在第幾個音符（播放高亮用）；找不到回 -1
export function noteAt(events, sec) {
  let hit = -1;
  for (const e of events) { if (e.at <= sec + 1e-3) hit = e.index; else break; }
  return hit;
}

// 小節起點時間（循環練習段用）：[第 1 小節起, 第 2 小節起, ...]
export function measureStarts(model, { tempo, rate = 1 } = {}) {
  const bpm = Math.max(20, Math.min(240, tempo || model?.tempo || DEFAULT_TEMPO)) * (rate || 1);
  const secPerBeat = 60 / bpm;
  const out = []; let t = 0;
  for (const m of model?.measures || []) {
    out.push(t);
    t += m.notes.reduce((a, n) => a + n.beats, 0) * secPerBeat;
  }
  return out;
}
