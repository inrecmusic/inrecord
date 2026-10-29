// lib/score/keymap.js — 電腦鍵盤彈奏對照（原型 KMAP）與時值的白話標籤（純函式）
export const KEYMAP = {};
"zsxdcvgbhnjm,".split("").forEach((c, i) => (KEYMAP[c] = 48 + i)); // Z 起 C3
"q2w3er5t6y7ui".split("").forEach((c, i) => (KEYMAP[c] = 60 + i)); // Q 起 C4
"9o0p".split("").forEach((c, i) => (KEYMAP[c] = 73 + i)); // 9 起 C♯5

const NAMES = [
  [4, "全音符"], [3, "附點二分音符"], [2, "二分音符"], [1.5, "附點四分音符"], [1, "四分音符"],
  [0.75, "附點八分音符"], [0.5, "八分音符"], [0.375, "附點十六分音符"], [0.25, "十六分音符"],
];
const FRACTIONS = [[0.25, "1/4"], [1 / 3, "1/3"], [0.5, "1/2"], [2 / 3, "2/3"], [0.75, "3/4"], [0.125, "1/8"], [1 / 6, "1/6"]];
const beatsText = (b) => FRACTIONS.find(([v]) => Math.abs(v - b) < 1e-6)?.[1] ?? String(Math.round(b * 1000) / 1000);

export function durationLabel(note) {
  const b = note.dur;
  if (note.tuplet) return `${note.tuplet.actual === 3 ? "三" : note.tuplet.actual}連音（${beatsText(b)} 拍）`;
  const name = NAMES.find(([v]) => Math.abs(v - b) < 1e-6)?.[1];
  return name ? `${name}（${beatsText(b)} 拍）` : `${beatsText(b)} 拍`;
}
