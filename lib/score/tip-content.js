// lib/score/tip-content.js — 提示框與和弦辨識面板的文字、迷你五線譜／迷你簡譜 SVG（純函式，照原型 evTip／chordTip／miniStaff／detect）
// 音名唱名一律用固定唱名（C＝Do，原型 SOL），簡譜數字照調號（首調）。
import { pitchName, jianpuDigit, noteName, chordTones, chordZh, romanOf } from "./chords.js";
import { durationLabel } from "./keymap.js";

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
export const SOL = ["Do", "Re", "Mi", "Fa", "Sol", "La", "Si"];
const SHARP = [["C", 0], ["C", 1], ["D", 0], ["D", 1], ["E", 0], ["F", 0], ["F", 1], ["G", 0], ["G", 1], ["A", 0], ["A", 1], ["B", 0]];
const FLAT = [["C", 0], ["D", -1], ["D", 0], ["E", -1], ["E", 0], ["F", 0], ["G", -1], ["G", 0], ["A", -1], ["A", 0], ["B", -1], ["B", 0]];
const pc = (m) => ((m % 12) + 12) % 12;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// MIDI → { step, alter, octave }（降號調用降記號拼）
export function midiToPitch(m, key) {
  const [step, alter] = (key && key.fifths < 0 ? FLAT : SHARP)[pc(m)];
  return { step, alter, octave: Math.floor((m - alter) / 12) - 1 };
}
const solOf = (p) => SOL[LETTERS.indexOf(p.step)] + (p.alter > 0 ? "（升）" : p.alter < 0 ? "（降）" : "");
export const jpText = (p, key) => {
  const d = jianpuDigit(p, key);
  return `${d.acc}${d.digit}`;
};
// 時值名稱不帶拍數（「四分音符」）；連音保留原說法
const durName = (note) => (note.tuplet ? durationLabel(note) : durationLabel(note).replace(/（[^）]*）$/, ""));

// 音符提示框：標題「G4 · Sol · 5」、副標「右手 · 四分音符」
export function noteTip(note, key) {
  const hand = note.staff === 2 ? "左手" : "右手";
  if (note.rest || !note.pitch) return { title: "休止符", sub: `簡譜寫作 0 · ${durName(note)}`, pitch: null };
  return { title: `${pitchName(note.pitch)} · ${solOf(note.pitch)} · ${jpText(note.pitch, key)}`, sub: `${hand} · ${durName(note)}`, pitch: note.pitch };
}

// 鍵盤琴鍵提示框：「C4 · Do · 1」（鍵盤沒有調號，以 C 大調看）
export function keyTip(m) {
  const p = midiToPitch(m);
  return { title: `${noteName(m)} · ${solOf(p)} · ${jpText(p, { fifths: 0 })}`, sub: "電腦鍵盤也能彈這個音", pitch: p };
}

// 和弦提示框：原位組成音放在 C4 起的兩個八度，根音標橘色、白鍵圈上寫簡譜數字
export function chordTip(chord, key) {
  const t = chordTones(chord);
  const hasBass = chord.bass && t.length > 0 && t[0] < 48;
  const tones = (hasBass ? t.slice(1) : t).map((m) => m + 12);
  const k = key || { fifths: 0 };
  const digits = tones.map((m) => jpText(midiToPitch(m, k), k));
  return {
    title: `${chord.name} ${chordZh(chord)} · ${romanOf(chord, k)}`,
    tones,
    root: tones[0],
    digits: new Map(tones.map((m, i) => [m, digits[i]])),
    foot: tones.length ? `原位：${tones.map((m) => noteName(m, k)).join(" ")} · 簡譜 ${digits.join(" ")}` : "這裡不彈和弦",
  };
}

// 和弦辨識面板（原型 detect）：鍵盤以 C 大調看級數與簡譜
const ROMAN_C = { 0: "I", 2: "II", 4: "III", 5: "IV", 7: "V", 9: "VI", 11: "VII" };
export function detectText(notes, recognized) {
  const C = { fifths: 0 };
  const jp = (m) => jpText(midiToPitch(m), C);
  if (!notes.length) return { big: "—", sub: "按下鍵盤上的和弦，這裡會顯示是哪個和弦。", tones: "" };
  if (notes.length === 1) return { big: noteName(notes[0]), sub: `${solOf(midiToPitch(notes[0]))} · 簡譜 ${jp(notes[0])}`, tones: "" };
  const list = `${notes.map((m) => noteName(m)).join(" ")}　簡譜 ${notes.map(jp).join(" ")}`;
  const r = recognized;
  if (!r) return { big: "?", sub: notes.length === 2 ? "再加一個音就能組成和弦" : "這組音不是常見的三和弦或七和弦", tones: list };
  const R = (r.quality === "" || r.quality === "m") && ROMAN_C[r.root];
  const rn = R ? ` · C 大調 ${r.quality === "m" ? R.toLowerCase() : R} 級` : "";
  const steps = r.iv.slice(1).map((v, i) => v - r.iv[i]).join("＋");
  return { big: r.name, sub: `${r.zh} · ${r.inv}${rn}`, tones: `${list}　半音 ${steps}` };
}

// 迷你五線譜：一個音（高音或低音譜號），含加線與升降記號
export function miniStaffSvg(pitch, clef = "T") {
  const gap = 7;
  const dia = pitch.octave * 7 + LETTERS.indexOf(pitch.step);
  const bottomDia = clef === "B" ? 18 : 30; // 低音譜號底線 G2、高音譜號底線 E4
  const bottomY = 4 * gap; // 先以第一線＝0 算，最後再整體位移
  const y = bottomY - (dia - bottomDia) * (gap / 2);
  const minY = Math.min(0, y) - 14, maxY = Math.max(bottomY, y) + 14;
  const w = 74, h = maxY - minY, x = 50;
  let s = `<svg width="${w}" height="${h}" viewBox="0 ${minY} ${w} ${h}" aria-hidden="true" class="mini-staff">`;
  for (let i = 0; i < 5; i++) s += `<line x1="2" x2="${w - 2}" y1="${i * gap}" y2="${i * gap}" stroke="currentColor" stroke-width=".9" opacity=".55"/>`;
  for (let ly = -gap; ly >= y - 0.1; ly -= gap) s += `<line x1="${x - 8}" x2="${x + 8}" y1="${ly}" y2="${ly}" stroke="currentColor" stroke-width=".9"/>`;
  for (let ly = bottomY + gap; ly <= y + 0.1; ly += gap) s += `<line x1="${x - 8}" x2="${x + 8}" y1="${ly}" y2="${ly}" stroke="currentColor" stroke-width=".9"/>`;
  s += clef === "B"
    ? `<text x="3" y="${gap * 1.55}" font-size="${gap * 3.4}" fill="currentColor" font-family="'Bravura','Noto Music','Apple Symbols',serif">𝄢</text>`
    : `<text x="2" y="${gap * 3.9}" font-size="${gap * 5.4}" fill="currentColor" font-family="'Bravura','Noto Music','Apple Symbols',serif">𝄞</text>`;
  if (pitch.alter) s += `<text x="${x - 15}" y="${y + 4}" font-size="13" fill="currentColor">${pitch.alter > 0 ? "♯" : "♭"}</text>`;
  s += `<ellipse cx="${x}" cy="${y}" rx="5" ry="3.6" transform="rotate(-20 ${x} ${y})" fill="currentColor"/>`;
  return `${s}</svg>`;
}

// 迷你簡譜：一個數字，含升降記號與八度點
export function miniJianpuSvg(pitch, key) {
  const d = jianpuDigit(pitch, key || { fifths: 0 });
  const w = 40, h = 64, cx = 22, base = 42;
  let s = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true" class="mini-jp">`;
  if (d.acc) s += `<text x="${cx - 12}" y="${base - 12}" font-size="12" fill="currentColor">${esc(d.acc)}</text>`;
  s += `<text x="${cx}" y="${base}" font-size="24" font-weight="700" text-anchor="middle" fill="currentColor" font-family="-apple-system,system-ui,sans-serif">${d.digit}</text>`;
  for (let i = 0; i < Math.abs(d.octave); i++) {
    const cy = d.octave > 0 ? base - 23 - i * 6 : base + 7 + i * 6;
    s += `<circle cx="${cx}" cy="${cy}" r="2.2" fill="currentColor"/>`;
  }
  return `${s}</svg>`;
}
