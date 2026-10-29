// lib/score/chords.js — 和弦組成音、級數、中文性質、鍵盤和弦辨識、音名與簡譜字（純函式）
// 規則移植自原型（docs/superpowers/specs/assets/2026-10-29-score-prototype.html 的 CQ／roman()／QUAL／recognize），
// 原型只會 C 大調；這裡改成以調號主音為 I、吃 v2 模型的 { root, kind, bass }（kind 為 MusicXML <kind> 值）。

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const MAJ = [0, 2, 4, 5, 7, 9, 11];
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const pcOf = (s) => (((SEMI[s.step] + (s.alter || 0)) % 12) + 12) % 12;
const accSym = (a) => (a > 0 ? "♯".repeat(a) : a < 0 ? "♭".repeat(-a) : "");

const KINDS = {
  major: { iv: [0, 4, 7], zh: "大三和弦" },
  minor: { iv: [0, 3, 7], zh: "小三和弦", lower: true },
  diminished: { iv: [0, 3, 6], zh: "減三和弦", lower: true, mark: "°" },
  augmented: { iv: [0, 4, 8], zh: "增三和弦", mark: "+" },
  dominant: { iv: [0, 4, 7, 10], zh: "屬七和弦", seventh: "7" },
  "major-seventh": { iv: [0, 4, 7, 11], zh: "大七和弦", seventh: "maj7" },
  "minor-seventh": { iv: [0, 3, 7, 10], zh: "小七和弦", lower: true, seventh: "7" },
  "diminished-seventh": { iv: [0, 3, 6, 9], zh: "減七和弦", lower: true, mark: "°", seventh: "7" },
  "half-diminished": { iv: [0, 3, 6, 10], zh: "半減七和弦", lower: true, mark: "ø", seventh: "7" },
  "augmented-seventh": { iv: [0, 4, 8, 10], zh: "增七和弦", mark: "+", seventh: "7" },
  "major-minor": { iv: [0, 3, 7, 11], zh: "小大七和弦", lower: true, seventh: "maj7" },
  "major-sixth": { iv: [0, 4, 7, 9], zh: "大六和弦", suffix: "6" },
  "minor-sixth": { iv: [0, 3, 7, 9], zh: "小六和弦", lower: true, suffix: "6" },
  "dominant-ninth": { iv: [0, 4, 7, 10, 14], zh: "屬九和弦", suffix: "9" },
  "major-ninth": { iv: [0, 4, 7, 11, 14], zh: "大九和弦", suffix: "maj9" },
  "minor-ninth": { iv: [0, 3, 7, 10, 14], zh: "小九和弦", lower: true, suffix: "9" },
  "suspended-second": { iv: [0, 2, 7], zh: "掛二和弦", suffix: "sus2" },
  "suspended-fourth": { iv: [0, 5, 7], zh: "掛四和弦", suffix: "sus4" },
  power: { iv: [0, 7], zh: "五度和弦", suffix: "5" },
};
const kindOf = (chord) => KINDS[chord?.kind] || KINDS.major;

// 組成音（MIDI）：根音放 C3–B3；slash 和弦的 bass 放在 C2–B2（一定最低）
export function chordTones(chord) {
  const r = 48 + pcOf(chord.root);
  const tones = kindOf(chord).iv.map((i) => r + i);
  if (chord.bass && pcOf(chord.bass) !== pcOf(chord.root)) return [36 + pcOf(chord.bass), ...tones];
  return tones;
}

export const chordZh = (chord) => kindOf(chord).zh;

const ROMAN = { 0: "I", 1: "♭II", 2: "II", 3: "♭III", 4: "III", 5: "IV", 6: "♯IV", 7: "V", 8: "♭VI", 9: "VI", 10: "♭VII", 11: "VII" };
const SUP = { 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷" };

// 級數：以 key.tonic 為 I；小三／小七／減和弦小寫；轉位用數字上標（原型 roman()）
export function romanOf(chord, key) {
  const k = kindOf(chord);
  const tonicPc = pcOf(key?.tonic || { step: "C", alter: 0 });
  const rel = (pcOf(chord.root) - tonicPc + 12) % 12;
  const R = ROMAN[rel];
  let s = k.lower ? R.replace(/[IV]+/, (x) => x.toLowerCase()) : R;
  if (k.mark) s += k.mark;
  if (chord.bass && pcOf(chord.bass) !== pcOf(chord.root)) {
    const d = (pcOf(chord.bass) - pcOf(chord.root) + 12) % 12;
    const seventh = !!k.seventh;
    let fig = null;
    if (d === 3 || d === 4) fig = seventh ? "65" : "6";
    else if (d === 6 || d === 7 || d === 8) fig = seventh ? "43" : "64";
    else if (d === 10 || d === 11) fig = "42";
    if (fig) return s + (k.seventh === "maj7" ? "maj" : "") + fig.split("").map((x) => SUP[x]).join("");
    const bassDeg = jianpuDigit({ ...chord.bass, octave: 4 }, key || { fifths: 0 });
    return `${s}${k.seventh || k.suffix || ""}/${bassDeg.acc}${bassDeg.digit}`;
  }
  return s + (k.seventh || k.suffix || "");
}

// 鍵盤和弦辨識（原型 QUAL／recognize）
const PCN = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const QUAL = [
  { iv: [0, 4, 7], n: "", zh: "大三和弦" },
  { iv: [0, 3, 7], n: "m", zh: "小三和弦" },
  { iv: [0, 3, 6], n: "dim", zh: "減三和弦" },
  { iv: [0, 4, 8], n: "aug", zh: "增三和弦" },
  { iv: [0, 4, 7, 10], n: "7", zh: "屬七和弦" },
  { iv: [0, 4, 7, 11], n: "maj7", zh: "大七和弦" },
  { iv: [0, 3, 7, 10], n: "m7", zh: "小七和弦" },
  { iv: [0, 2, 7], n: "sus2", zh: "掛二和弦" },
  { iv: [0, 5, 7], n: "sus4", zh: "掛四和弦" },
];
export function recognizeChord(midis) {
  const pcs = [...new Set(midis.map((m) => ((m % 12) + 12) % 12))];
  if (pcs.length < 3) return null;
  const bass = ((Math.min(...midis) % 12) + 12) % 12;
  for (const q of QUAL) {
    if (q.iv.length !== pcs.length) continue;
    for (const r of pcs) {
      const rel = pcs.map((p) => (p - r + 12) % 12).sort((a, b) => a - b);
      if (rel.join() !== q.iv.join()) continue;
      let inv = "原位";
      if (bass !== r) {
        const d = (bass - r + 12) % 12;
        inv = d === 3 || d === 4 ? "第一轉位" : d === 6 || d === 7 || d === 8 ? "第二轉位" : "第三轉位";
      }
      return { name: PCN[r] + q.n, zh: q.zh, inv, root: r };
    }
  }
  return null;
}

// 只有 MIDI 時的音名：調號有降記號就拼降、否則拼升（例 61 在 G 大調 → C♯4）
const SHARP_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const FLAT_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
export function noteName(midi, key) {
  const names = key && key.fifths < 0 ? FLAT_NAMES : SHARP_NAMES;
  return names[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}
// 譜上寫的拼法（模型的 pitch）
export const pitchName = (p) => `${p.step}${accSym(p.alter || 0)}${p.octave}`;

// 簡譜字：首調唱名，以調號的「大調主音」為 1（小調用關係大調，台灣流行簡譜常見寫法）；
// octave 相對主音所在的第 4 八度（G 大調 G4＝1、F♯4＝低音 7）
const MAJOR_TONIC_BY_FIFTHS = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];
export function jianpuDigit(pitch, key) {
  const t = MAJOR_TONIC_BY_FIFTHS[Math.max(-7, Math.min(7, key?.fifths || 0)) + 7];
  const tonic = { step: t[0], alter: t[1] === "#" ? 1 : t[1] === "b" ? -1 : 0 };
  const li = LETTERS.indexOf(pitch.step);
  const ti = LETTERS.indexOf(tonic.step);
  const deg = (li - ti + 7) % 7;
  const expected = (pcOf(tonic) + MAJ[deg]) % 12;
  let diff = (pcOf(pitch) - expected + 12) % 12;
  if (diff > 6) diff -= 12;
  const acc = diff > 0 ? "♯".repeat(diff) : diff < 0 ? "♭".repeat(-diff) : "";
  const octave = Math.floor((li + 7 * pitch.octave - (ti + 7 * 4)) / 7);
  return { digit: String(deg + 1), acc, octave };
}
