// lib/score/jianpu-input.js — 後台「直接打簡譜」：右手簡譜＋每小節和弦 → 單行 MusicXML（純函式可測）
//
// 語法沿用原型「後台改譜」並擴充：
//   旋律：1–7 唱名、0 休止、- 延長一拍、' 高八度、, 低八度、_ 八分（__ 十六分）、. 附點、# b 升降、| 小節線
//         （以四分音符為一拍；第一小節拍數不足視為弱起）
//   和弦：| 分小節，每小節 1／2／4 個（平均分配拍數），C Am G7 Cmaj7 Dm7 Bdim Csus4 F#m Bb G7/B…；空白小節＝沿用前一個
// 轉出的 MusicXML 存進 scores.musicxml，之後五線譜、簡譜、播放、自動左手伴奏全部沿用同一條路。
import { ScoreError } from "./musicxml.js";

const MAJ = [0, 2, 4, 5, 7, 9, 11];
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const FIFTHS = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, "C#": 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7 };
const KIND = { "": "major", m: "minor", 7: "dominant", maj7: "major-seventh", m7: "minor-seventh", dim: "diminished", dim7: "diminished-seventh", m7b5: "half-diminished", aug: "augmented", sus2: "suspended-second", sus4: "suspended-fourth", 6: "major-sixth", m6: "minor-sixth", 9: "dominant-ninth" };
const CHORD_RE = /^([A-G])([#b]?)(maj7|m7b5|m7|m6|m|dim7|dim|aug|sus2|sus4|7|6|9)?(?:\/([A-G])([#b]?))?$/;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const bad = (msg) => new ScoreError("bad_jianpu", msg);
const STD = [[4, "whole", 0], [3, "half", 1], [2, "half", 0], [1.5, "quarter", 1], [1, "quarter", 0], [0.75, "eighth", 1], [0.5, "eighth", 0], [0.375, "16th", 1], [0.25, "16th", 0]];
const EPS = 1e-6;

function splitDur(d) {
  const out = [];
  let rest = d;
  while (rest > EPS) {
    const s = STD.find(([v]) => v <= rest + EPS);
    if (!s) break;
    out.push(s);
    rest -= s[0];
  }
  return out;
}

function parseMelody(text, barLen) {
  const bars = String(text || "").split("|").map((s) => s.trim()).filter(Boolean);
  if (!bars.length) throw bad("旋律是空的");
  return bars.map((b, bi) => {
    const notes = [];
    let t = 0;
    for (const tk of b.split(/\s+/)) {
      if (tk === "-") {
        const last = notes[notes.length - 1];
        if (!last) throw bad(`第 ${bi + 1} 小節開頭不能是「-」`);
        last.dur += 1;
        t += 1;
        continue;
      }
      const m = /^(_{0,2})([#b]?)([0-7])([',]*)(\.?)$/.exec(tk);
      if (!m) throw bad(`看不懂「${tk}」（第 ${bi + 1} 小節）`);
      let dur = m[1].length === 2 ? 0.25 : m[1].length === 1 ? 0.5 : 1;
      if (m[5]) dur *= 1.5;
      const octave = [...m[4]].reduce((a, c) => a + (c === "'" ? 1 : -1), 0);
      notes.push({ onset: t, dur, degree: Number(m[3]), acc: m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0, octave });
      t += dur;
    }
    const isPickup = bi === 0 && bars.length > 1 && t < barLen - EPS;
    if (!isPickup && Math.abs(t - barLen) > EPS) throw bad(`第 ${bi + 1} 小節有 ${Math.round(t * 1000) / 1000} 拍，需要剛好 ${barLen} 拍`);
    return { notes, length: t, implicit: isPickup };
  });
}

function parseChords(text, barCount) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const bars = raw.split("|").map((s) => s.trim());
  if (bars.length > barCount) throw bad(`和弦有 ${bars.length} 小節，比旋律的 ${barCount} 小節多`);
  return bars.map((b, bi) => parseChordBar(b, bi));
}

// 一小節的和弦文字 → [{ step, alter, kind, bass }]；空白＝沿用前一個（回傳空陣列）。後台「改和弦」也用這個。
export function parseChordBar(text, bi) {
  const b = String(text || "").trim();
  if (!b) return [];
  const toks = b.split(/\s+/);
  if (![1, 2, 4].includes(toks.length)) throw bad(`第 ${bi + 1} 小節有 ${toks.length} 個和弦，一小節請放 1、2 或 4 個`);
  return toks.map((tk) => {
    if (/^N\.?C\.?$/i.test(tk)) return { step: "C", alter: 0, kind: "none", bass: null }; // 無和弦
    const m = CHORD_RE.exec(tk);
    if (!m) throw bad(`看不懂和弦「${tk}」（第 ${bi + 1} 小節），請用 C、Am、G7、Cmaj7、G7/B 這種寫法`);
    return { step: m[1], alter: m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0, kind: KIND[m[3] || ""], bass: m[4] ? { step: m[4], alter: m[5] === "#" ? 1 : m[5] === "b" ? -1 : 0 } : null };
  });
}

// 和弦（root/kind/bass）→ 文字框寫法；KIND 以外的型態回傳 null（由呼叫端改用模型的和弦名）
export function chordToken(c) {
  const suffix = Object.keys(KIND).find((k) => KIND[k] === c.kind);
  if (suffix === undefined || (c.degrees && c.degrees.length)) return null;
  const acc = (a) => (a > 0 ? "#" : a < 0 ? "b" : "");
  return `${c.root.step}${acc(c.root.alter)}${suffix}${c.bass ? `/${c.bass.step}${acc(c.bass.alter)}` : ""}`;
}

// 唱名 → 音高：1＝主音所在的第 4 八度；字母依調號往上數，升降另外算
function pitchOf(n, tonic) {
  const ti = LETTERS.indexOf(tonic[0]);
  const tonicPc = (SEMI[tonic[0]] + (tonic[1] === "#" ? 1 : tonic[1] === "b" ? -1 : 0) + 12) % 12;
  const midi = 60 + tonicPc + MAJ[n.degree - 1] + n.acc + 12 * n.octave;
  const li = (ti + n.degree - 1) % 7;
  const step = LETTERS[li];
  const octave = Math.floor((midi - SEMI[step] + 6) / 12) - 1; // 最接近的那個八度
  const alter = midi - ((octave + 1) * 12 + SEMI[step]);
  return { step, alter, octave };
}

export function jianpuToMusicXml({ title = "", key = "C", beats = 4, beatType = 4, tempo = null, melody, chords }) {
  const tonic = FIFTHS[key] !== undefined ? key : "C";
  const barLen = (Number(beats) * 4) / Number(beatType);
  if (!(barLen > 0)) throw bad("拍號不正確");
  const bars = parseMelody(melody, barLen);
  const chordBars = parseChords(chords, bars.length);
  const div = 4;
  const out = [];
  out.push(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>${esc(title)}</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">`);
  bars.forEach((bar, bi) => {
    out.push(`    <measure number="${bar.implicit ? 0 : bars[0].implicit ? bi : bi + 1}"${bar.implicit ? ' implicit="yes"' : ""}>`);
    if (bi === 0) {
      out.push(`      <attributes><divisions>${div}</divisions><key><fifths>${FIFTHS[tonic]}</fifths><mode>major</mode></key><time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>`);
      if (tempo) out.push(`      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${Number(tempo)}</per-minute></metronome></direction-type><sound tempo="${Number(tempo)}"/></direction>`);
    }
    const cs = chordBars[bi] || [];
    const chordAt = new Map(cs.map((c, i) => [Math.round(((bar.length * i) / cs.length) * 1000) / 1000, c]));
    const harmony = (c, offset) =>
      `      <harmony><root><root-step>${c.step}</root-step>${c.alter ? `<root-alter>${c.alter}</root-alter>` : ""}</root><kind${c.kind === "none" ? ' text="N.C."' : ""}>${c.kind}</kind>${c.bass ? `<bass><bass-step>${c.bass.step}</bass-step>${c.bass.alter ? `<bass-alter>${c.bass.alter}</bass-alter>` : ""}</bass>` : ""}${offset ? `<offset>${offset}</offset>` : ""}</harmony>`;
    const pending = [...chordAt.entries()].sort((a, b) => a[0] - b[0]);
    for (const n of bar.notes) {
      // 落在這個音期間（含起點）的和弦寫在它前面，用 offset 對到正確拍位
      while (pending.length && pending[0][0] < n.onset + n.dur - EPS) {
        const [at, c] = pending.shift();
        out.push(harmony(c, Math.round((at - n.onset) * div)));
      }
      const parts = splitDur(n.dur);
      const p = n.degree ? pitchOf(n, tonic) : null;
      parts.forEach(([d, type, dots], i) => {
        const tieStart = i < parts.length - 1, tieStop = i > 0;
        out.push(`      <note>${p ? `<pitch><step>${p.step}</step>${p.alter ? `<alter>${p.alter}</alter>` : ""}<octave>${p.octave}</octave></pitch>` : "<rest/>"}<duration>${d * div}</duration>${p && tieStop ? '<tie type="stop"/>' : ""}${p && tieStart ? '<tie type="start"/>' : ""}<voice>1</voice><type>${type}</type>${dots ? "<dot/>" : ""}${p && (tieStart || tieStop) ? `<notations>${tieStop ? '<tied type="stop"/>' : ""}${tieStart ? '<tied type="start"/>' : ""}</notations>` : ""}</note>`);
      });
    }
    out.push("    </measure>");
  });
  out.push("  </part>\n</score-partwise>\n");
  return out.join("\n");
}
