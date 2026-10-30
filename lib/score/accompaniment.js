// lib/score/accompaniment.js — 依和弦自動產生左手伴奏（純函式可測）
//
// 只有右手旋律＋和弦記號的曲子，左手由這裡產生；學員可在四種型態間切換（照原型
// docs/superpowers/specs/assets/2026-10-29-score-prototype.html 的 PATTERNS／makeChord／lhRoot）。
// 產生的音符直接放進 v2 模型（staff 2），簡譜、播放、高亮照常使用；accompanimentXml 再把同一批音符
// 寫成大譜表第二行給 OSMD 畫，兩邊的 (小節, staff, 拍位, 音高) 一一對得上，五線譜高亮才對得回來。

import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { intervalsOf } from "./chords.js";

export const ACCOMPANIMENTS = [
  { id: "block", label: "柱式" },
  { id: "bass", label: "根音＋和弦" },
  { id: "broken", label: "分解" },
  { id: "arp", label: "琶音" },
];

const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const pcOf = (s) => (((SEMI[s.step] + (s.alter || 0)) % 12) + 12) % 12;
const lhRoot = (pc) => (36 + pc < 41 ? 48 + pc : 36 + pc); // 根音落在 F2–E3
const EPS = 1e-6;

// 原型 makeChord：根音在 F2–E3、三音 t、五音 f；slash 和弦的低音放在根音下面
export function voicing(chord) {
  const pc = pcOf(chord.root);
  const r = lhRoot(pc);
  const iv = intervalsOf(chord).filter((i) => i < 12); // 九、十一、十三度等延伸音左手不彈
  let tones = iv.map((i) => r + i);
  let low = r;
  let slash = false;
  if (chord.bass && pcOf(chord.bass) !== pc) {
    slash = true;
    low = lhRoot(pcOf(chord.bass));
    if (low >= r) low -= 12;
    if (low < 36) low += 12;
    tones = tones.map((t) => (t <= low ? t + 12 : t)).sort((a, b) => a - b);
  }
  return { r, low, t: r + (iv[1] ?? 4), f: r + (iv[2] ?? 7), tones, slash };
}

// 原型 PATTERNS：回傳 [起點(拍), 長度(拍), MIDI 陣列]，L＝這個和弦佔的拍數
export function patternEvents(style, v, L) {
  const clip = (evs) => evs.filter(([s]) => s < L - EPS).map(([s, d, p]) => [s, Math.min(d, L - s), p]);
  const cycle = (seq, step) => {
    const out = [];
    for (let i = 0; i * step < L - EPS; i++) out.push([i * step, step, [seq[i % seq.length]]]);
    return out;
  };
  const chordTones = v.slash ? [v.low, ...v.tones] : v.tones;
  if (style === "bass") {
    const b = v.low >= 48 ? v.low - 12 : v.low;
    if (L < 2) return [[0, L, [b, ...v.tones]]];
    const out = [];
    for (let k = 0; k < L - EPS; k++) out.push(k % 2 ? [k, 1, v.tones] : [k, 1, [k === 2 && !v.slash ? b + 7 : b]]);
    return clip(out);
  }
  if (style === "broken") {
    const up = (p) => (p <= v.low ? p + 12 : p);
    return clip(cycle([v.low, up(v.f), up(v.t), up(v.f)], 1));
  }
  if (style === "arp") {
    const a = v.low >= 48 ? v.low - 12 : v.low;
    const rr = v.r >= 48 ? v.r - 12 : v.r;
    const d = v.t - v.r;
    return clip(cycle([a, rr + 7, rr + 12, rr + 12 + d, rr + 19, rr + 12 + d, rr + 12, rr + 7], 0.5));
  }
  return [[0, L, chordTones]]; // block（柱式）
}

// 每個和弦管到下一個和弦或小節線為止；小節開頭沒寫和弦就沿用上一個；第一個和弦之前（含弱起）不配
export function chordSegments(model) {
  const segs = [];
  let current = null;
  for (const m of model.measures) {
    const here = (model.chords || []).filter((c) => c.measure === m.index).sort((a, b) => a.onset - b.onset);
    const points = [];
    if (current && !(here[0] && here[0].onset < EPS)) points.push({ onset: 0, chord: current });
    for (const c of here) points.push({ onset: c.onset, chord: c });
    points.forEach((p, i) => {
      const end = points[i + 1]?.onset ?? m.length;
      if (end - p.onset > EPS) segs.push({ measure: m.index, start: p.onset, len: end - p.onset, chord: p.chord });
    });
    if (here.length) current = here[here.length - 1];
  }
  return segs;
}

// 時值拆成標準音符（必要時用連結線接起來）
const STD = [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.375, 0.25];
function splitDur(d) {
  const out = [];
  let rest = d;
  while (rest > EPS) {
    const s = STD.find((v) => v <= rest + EPS) ?? rest;
    out.push(s);
    rest -= s;
  }
  return out;
}

const SHARP = [["C", 0], ["C", 1], ["D", 0], ["D", 1], ["E", 0], ["F", 0], ["F", 1], ["G", 0], ["G", 1], ["A", 0], ["A", 1], ["B", 0]];
const FLAT = [["C", 0], ["D", -1], ["D", 0], ["E", -1], ["E", 0], ["F", 0], ["G", -1], ["G", 0], ["A", -1], ["A", 0], ["B", -1], ["B", 0]];
function spell(midi, key) {
  const [step, alter] = (key?.fifths < 0 ? FLAT : SHARP)[((midi % 12) + 12) % 12];
  return { step, alter, octave: Math.floor((midi - alter) / 12) - 1 };
}

const sortNotes = (notes) =>
  [...notes]
    .sort((a, b) => a.measure - b.measure || a.staff - b.staff || a.onset - b.onset || (a.midi ?? -1) - (b.midi ?? -1))
    .map((n, i) => ({ ...n, id: `n${i}` }));

// 產生左手：style 'original' 原樣回傳；其他型態換掉原本的左手（沒有和弦就沒有左手）
export function withAccompaniment(model, style) {
  if (!model || style === "original") return model;
  const generated = [];
  for (const seg of chordSegments(model)) {
    if (seg.chord.kind === "none") continue; // N.C.
    const key = model.measures[seg.measure].key;
    const v = voicing(seg.chord);
    for (const [s, d, midis] of patternEvents(style, v, seg.len)) {
      const parts = splitDur(d);
      for (const midi of midis) {
        let onset = seg.start + s;
        parts.forEach((pd, i) => {
          generated.push({
            measure: seg.measure, staff: 2, voice: "5", onset: Math.round(onset * 1e9) / 1e9, dur: pd,
            rest: false, midi, pitch: spell(midi, key),
            tieStart: i < parts.length - 1, tieStop: i > 0,
            dots: [3, 1.5, 0.75, 0.375].includes(pd) ? 1 : 0, tuplet: null,
          });
          onset += pd;
        });
      }
    }
  }
  const rh = model.notes.filter((n) => n.staff !== 2);
  return { ...model, notes: sortNotes([...rh, ...generated]), hasLeftHand: generated.length > 0, accompaniment: style };
}

// ── 寫成大譜表第二行（給 OSMD）──
const kids = (el, tag) => {
  const out = [];
  for (let c = el?.firstChild; c; c = c.nextSibling) if (c.nodeType === 1 && (!tag || c.nodeName === tag)) out.push(c);
  return out;
};
const kidText = (el, tag) => kids(el, tag)[0]?.textContent.trim() ?? null;
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const TYPE = { 4: ["whole", 0], 3: ["half", 1], 2: ["half", 0], 1.5: ["quarter", 1], 1: ["quarter", 0], 0.75: ["eighth", 1], 0.5: ["eighth", 0], 0.375: ["16th", 1], 0.25: ["16th", 0] };

function el(doc, name, text, attrs = {}) {
  const e = doc.createElement(name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.appendChild(doc.createTextNode(String(text)));
  return e;
}

export function accompanimentXml(xmlText, model) {
  const doc = new DOMParser({ onError: () => {} }).parseFromString(xmlText, "text/xml");
  const part = kids(doc.documentElement, "part")[0];
  if (!part) return xmlText;
  const measures = kids(part, "measure");

  // 1) divisions 不是 4 的倍數就放大（產生的音最短十六分音符）
  let k = 1;
  for (const mEl of measures) {
    for (const e of kids(mEl)) {
      if (e.nodeName === "attributes") {
        const dEl = kids(e, "divisions")[0];
        if (dEl) {
          const d = Number(dEl.textContent.trim());
          k = 4 / gcd(d, 4);
          dEl.textContent = String(d * k);
        }
      }
      if (k === 1) continue;
      for (const durEl of [...kids(e, "duration"), ...kids(e, "offset")]) durEl.textContent = String(Number(durEl.textContent.trim()) * k);
    }
  }

  // 2) 確保是兩行譜（第二行低音譜號）
  const firstAttr = kids(measures[0], "attributes")[0] || measures[0].insertBefore(doc.createElement("attributes"), measures[0].firstChild);
  let stavesEl = kids(firstAttr, "staves")[0];
  if (!stavesEl) {
    stavesEl = el(doc, "staves", 2);
    const clef = kids(firstAttr, "clef")[0];
    firstAttr.insertBefore(stavesEl, clef || null);
  } else stavesEl.textContent = "2";
  const clefs = kids(firstAttr, "clef");
  if (!clefs.some((c) => c.getAttribute("number") === "2")) {
    for (const c of clefs) if (!c.getAttribute("number")) c.setAttribute("number", "1");
    const c2 = el(doc, "clef", undefined, { number: "2" });
    c2.appendChild(el(doc, "sign", "F"));
    c2.appendChild(el(doc, "line", 4));
    const after = kids(firstAttr).find((x) => ["staff-details", "transpose", "directive", "measure-style"].includes(x.nodeName));
    firstAttr.insertBefore(c2, after || null);
  }

  // 3) 每小節：拿掉原本左手音符，接上產生的左手
  const byMeasure = new Map();
  for (const n of model.notes) if (n.staff === 2) (byMeasure.get(n.measure) || byMeasure.set(n.measure, []).get(n.measure)).push(n);
  let divisions = 1;
  measures.forEach((mEl, mi) => {
    for (const e of kids(mEl)) {
      if (e.nodeName === "attributes" && kidText(e, "divisions")) divisions = Number(kidText(e, "divisions"));
      if ((e.nodeName === "note" || e.nodeName === "forward") && kidText(e, "staff") === "2") mEl.removeChild(e);
    }
    let last = kids(mEl).pop();
    while (last && last.nodeName === "backup") {
      mEl.removeChild(last);
      last = kids(mEl).pop();
    }
    const notes = (byMeasure.get(mi) || []).sort((a, b) => a.onset - b.onset || a.midi - b.midi);
    if (!notes.length) return;
    // 小節目前游標位置 → backup 回小節起點
    let cursor = 0;
    let lastOnset = 0;
    for (const e of kids(mEl)) {
      const dur = Number(kidText(e, "duration") || 0);
      if (e.nodeName === "backup") cursor = Math.max(0, cursor - dur);
      else if (e.nodeName === "forward") cursor += dur;
      else if (e.nodeName === "note" && !kids(e, "grace").length) {
        if (kids(e, "chord").length) continue;
        lastOnset = cursor;
        cursor += dur;
      }
    }
    void lastOnset;
    const barline = kids(mEl, "barline").find((b) => b.getAttribute("location") === "right");
    const put = (node) => mEl.insertBefore(node, barline || null);
    if (cursor > 0) {
      const bk = el(doc, "backup");
      bk.appendChild(el(doc, "duration", cursor));
      put(bk);
    }
    let pos = 0; // 拍
    let prev = null;
    for (const n of notes) {
      const isChord = prev && Math.abs(prev.onset - n.onset) < EPS && Math.abs(prev.dur - n.dur) < EPS;
      if (!isChord && n.onset - pos > EPS) {
        const fw = el(doc, "forward");
        fw.appendChild(el(doc, "duration", Math.round((n.onset - pos) * divisions)));
        fw.appendChild(el(doc, "voice", 5));
        fw.appendChild(el(doc, "staff", 2));
        put(fw);
        pos = n.onset;
      }
      const note = el(doc, "note");
      if (isChord) note.appendChild(el(doc, "chord"));
      const p = el(doc, "pitch");
      p.appendChild(el(doc, "step", n.pitch.step));
      if (n.pitch.alter) p.appendChild(el(doc, "alter", n.pitch.alter));
      p.appendChild(el(doc, "octave", n.pitch.octave));
      note.appendChild(p);
      note.appendChild(el(doc, "duration", Math.round(n.dur * divisions)));
      if (n.tieStop) note.appendChild(el(doc, "tie", undefined, { type: "stop" }));
      if (n.tieStart) note.appendChild(el(doc, "tie", undefined, { type: "start" }));
      note.appendChild(el(doc, "voice", 5));
      const [type, dots] = TYPE[n.dur] || ["quarter", 0];
      note.appendChild(el(doc, "type", type));
      for (let i = 0; i < dots; i++) note.appendChild(el(doc, "dot"));
      note.appendChild(el(doc, "staff", 2));
      if (n.tieStart || n.tieStop) {
        const nt = el(doc, "notations");
        if (n.tieStop) nt.appendChild(el(doc, "tied", undefined, { type: "stop" }));
        if (n.tieStart) nt.appendChild(el(doc, "tied", undefined, { type: "start" }));
        note.appendChild(nt);
      }
      put(note);
      if (!isChord) pos = n.onset + n.dur;
      prev = n;
    }
  });
  return new XMLSerializer().serializeToString(doc);
}
