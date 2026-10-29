// lib/score/musicxml.js — MusicXML（partwise、鋼琴大譜表兩行）→ v2 模型（純函式可測）
//
// v2 的單一來源：簡譜、播放時間軸、和弦級數、五線譜高亮都只吃這份模型、共用同一組音符 id。
// 五線譜本身交給 OSMD 直接畫原始 XML，所以這裡略過的元素（踏板、強弱等）五線譜上仍看得到，
// 只是簡譜與播放不處理——匯入時以 warnings 列給後台看。
//
// 模型（時間單位一律「四分音符＝1」）：
//   { title, composer, tempo,
//     measures:[{ index, number, length, implicit, key:{fifths,mode,tonic}, time:{beats,beatType},
//                 repeatStart, repeatEnd, repeatTimes, ending:{numbers,type}|null }],
//     notes:[{ id, measure, staff, voice, onset, dur, rest, midi, pitch, tieStart, tieStop, dots, tuplet }],
//     chords:[{ id, measure, onset, root, kind, bass, name }], hasChords, warnings:[{code,message,measure?}] }
// 音符 id 依 (measure, staff, onset, midi) 排序後連號 n0, n1…；和弦 id 依出現順序 c0, c1…

import { DOMParser } from "@xmldom/xmldom";

export class ScoreError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code; // 'not_musicxml' | 'no_part' | 'not_grand_staff' | 'empty'
  }
}

// 說明文件（給 Rick）與匯入驗證共用的支援清單
export const SUPPORT = {
  supported: [
    { element: "note", label: "音符與休止符" },
    { element: "staves", label: "鋼琴大譜表兩行（上右手、下左手）" },
    { element: "chord", label: "同時按的音（和弦音）" },
    { element: "key", label: "調號與曲中轉調" },
    { element: "time", label: "拍號與曲中變拍（例如 4/4、3/4、6/8）" },
    { element: "dot", label: "附點" },
    { element: "tie", label: "連結線" },
    { element: "time-modification", label: "三連音" },
    { element: "accidental", label: "臨時升降與還原記號" },
    { element: "harmony", label: "和弦記號（和弦名）" },
    { element: "sound", label: "速度標示" },
    { element: "repeat", label: "反覆記號與第一／第二結尾（播放會展開）" },
    { element: "implicit", label: "弱起小節" },
  ],
  ignored: [
    { element: "pedal", label: "踏板記號" },
    { element: "dynamics", label: "表情記號（強弱，例如 p、f）" },
    { element: "wedge", label: "漸強／漸弱記號" },
    { element: "ornaments", label: "裝飾記號（顫音、迴音等）" },
    { element: "grace", label: "裝飾音（倚音）" },
    { element: "fermata", label: "延長記號" },
    { element: "lyric", label: "歌詞" },
    { element: "segno", label: "D.S.／Coda 跳躍記號（不展開）" },
  ],
};
const IGNORED_LABEL = Object.fromEntries(SUPPORT.ignored.map((x) => [x.element, x.label]));

const SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
// 五度圈：fifths -7..7 → 大調主音／關係小調主音
const MAJOR_TONICS = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];
const MINOR_TONICS = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#", "G#", "D#", "A#"];
const spell = (s) => ({ step: s[0], alter: s[1] === "#" ? 1 : s[1] === "b" ? -1 : 0 });
// MusicXML <kind> → 和弦名後綴
const KIND_SUFFIX = {
  major: "", minor: "m", augmented: "aug", diminished: "dim",
  dominant: "7", "major-seventh": "maj7", "minor-seventh": "m7", "diminished-seventh": "dim7",
  "augmented-seventh": "aug7", "half-diminished": "m7b5", "major-minor": "m(maj7)",
  "major-sixth": "6", "minor-sixth": "m6", "dominant-ninth": "9", "major-ninth": "maj9", "minor-ninth": "m9",
  "dominant-11th": "11", "dominant-13th": "13", "suspended-second": "sus2", "suspended-fourth": "sus4",
  power: "5", none: "",
};
const accText = (alter) => (alter > 0 ? "#".repeat(alter) : alter < 0 ? "b".repeat(-alter) : "");
const EPS = 1e-9;
const clean = (x) => Math.round(x * 1e9) / 1e9;

const kids = (el, tag) => {
  const out = [];
  for (let c = el?.firstChild; c; c = c.nextSibling) if (c.nodeType === 1 && (!tag || c.nodeName === tag)) out.push(c);
  return out;
};
const kid = (el, tag) => kids(el, tag)[0] || null;
const txt = (el, tag) => {
  const k = tag ? kid(el, tag) : el;
  return k ? k.textContent.trim() : null;
};
const num = (el, tag, fallback = null) => {
  const t = txt(el, tag);
  const v = t === null || t === "" ? NaN : Number(t);
  return Number.isFinite(v) ? v : fallback;
};
const has = (el, tag) => el.getElementsByTagName(tag).length > 0;

function parseDoc(xmlText) {
  let fatal = false;
  let doc;
  try {
    doc = new DOMParser({
      onError: (level) => {
        if (level !== "warning") fatal = true;
      },
    }).parseFromString(xmlText, "text/xml");
  } catch {
    fatal = true;
  }
  if (fatal || !doc?.documentElement) throw new ScoreError("not_musicxml", "這不是可讀的 XML 檔");
  return doc;
}

export function parseMusicXml(xmlText) {
  if (typeof xmlText !== "string" || !xmlText.trim()) throw new ScoreError("empty", "檔案是空的");
  const doc = parseDoc(xmlText);
  const root = doc.documentElement;
  if (root.nodeName === "score-timewise")
    throw new ScoreError("not_musicxml", "這是 timewise 格式的 MusicXML，請改匯出一般（partwise）格式");
  if (root.nodeName !== "score-partwise") throw new ScoreError("not_musicxml", "這不是 MusicXML 樂譜檔");

  const warnings = [];
  const parts = kids(root, "part");
  if (!parts.length) throw new ScoreError("no_part", "樂譜裡沒有任何聲部");
  if (parts.length > 1) warnings.push({ code: "multi_part", message: `樂譜有 ${parts.length} 個聲部，只會讀第一個（鋼琴）` });
  const part = parts[0];
  const xmlMeasures = kids(part, "measure");
  if (!xmlMeasures.length) throw new ScoreError("empty", "樂譜裡沒有任何小節");

  // 先確認是兩行大譜表：第一個寫到 <staves> 的值
  const stavesEl = part.getElementsByTagName("staves")[0];
  const staves = stavesEl ? Number(stavesEl.textContent.trim()) : 1;
  if (staves !== 2) throw new ScoreError("not_grand_staff", "需要鋼琴大譜表兩行（上右手、下左手）");

  const workTitle = txt(kid(root, "work"), "work-title") || txt(root, "movement-title") || "";
  const composerEl = kids(kid(root, "identification"), "creator").find((c) => c.getAttribute("type") === "composer");

  let divisions = 1;
  let key = { fifths: 0, mode: "major", tonic: spell("C") };
  let time = { beats: 4, beatType: 4 };
  let tempo = null;
  let openEnding = null; // 跨小節的結尾括號
  const ignoredSeen = new Set();
  const warnIgnored = (element, measureIndex) => {
    if (ignoredSeen.has(element)) return;
    ignoredSeen.add(element);
    warnings.push({
      code: "ignored_element",
      message: `${IGNORED_LABEL[element]}：簡譜與播放會略過（五線譜照原檔畫）`,
      measure: measureIndex,
    });
  };

  const measures = [];
  const rawNotes = [];
  const chords = [];

  xmlMeasures.forEach((mEl, index) => {
    let cursor = 0;
    let maxPos = 0;
    let lastOnset = 0;
    const measure = {
      index,
      number: mEl.getAttribute("number") || String(index + 1),
      length: 0,
      implicit: mEl.getAttribute("implicit") === "yes",
      key,
      time,
      repeatStart: false,
      repeatEnd: false,
      repeatTimes: 2,
      ending: openEnding ? { numbers: openEnding, type: "start" } : null,
    };
    const voicesByStaff = { 1: new Set(), 2: new Set() };

    for (const el of kids(mEl)) {
      const tag = el.nodeName;
      if (tag === "attributes") {
        const d = num(el, "divisions");
        if (d) divisions = d;
        const k = kid(el, "key");
        if (k && num(k, "fifths") !== null) {
          const fifths = Math.max(-7, Math.min(7, num(k, "fifths")));
          const mode = txt(k, "mode") === "minor" ? "minor" : "major";
          key = { fifths, mode, tonic: spell((mode === "minor" ? MINOR_TONICS : MAJOR_TONICS)[fifths + 7]) };
          measure.key = key;
        }
        const t = kid(el, "time");
        if (t && num(t, "beats") && num(t, "beat-type")) {
          time = { beats: num(t, "beats"), beatType: num(t, "beat-type") };
          measure.time = time;
        }
      } else if (tag === "backup") {
        cursor -= num(el, "duration", 0) / divisions;
        if (cursor < 0) cursor = 0;
      } else if (tag === "forward") {
        cursor += num(el, "duration", 0) / divisions;
        maxPos = Math.max(maxPos, cursor);
      } else if (tag === "direction" || tag === "sound") {
        const sound = tag === "sound" ? el : kid(el, "sound");
        if (tempo === null && sound?.getAttribute("tempo")) tempo = Number(sound.getAttribute("tempo")) || null;
        if (tag === "direction") {
          for (const dt of kids(el, "direction-type")) {
            if (tempo === null && kid(dt, "metronome")) {
              const mt = kid(dt, "metronome");
              const per = num(mt, "per-minute");
              const unit = { half: 2, quarter: 1, eighth: 0.5 }[txt(mt, "beat-unit")] || 1;
              if (per) tempo = per * unit * (kid(mt, "beat-unit-dot") ? 1.5 : 1);
            }
            for (const name of ["pedal", "dynamics", "wedge"]) if (kid(dt, name)) warnIgnored(name, index);
            if (kid(dt, "segno") || kid(dt, "coda")) warnIgnored("segno", index);
          }
          if (sound && ["dalsegno", "dacapo", "tocoda", "segno", "coda", "fine"].some((a) => sound.getAttribute(a)))
            warnIgnored("segno", index);
        }
      } else if (tag === "harmony") {
        const r = kid(el, "root");
        if (!r || !txt(r, "root-step")) continue;
        const root = { step: txt(r, "root-step"), alter: num(r, "root-alter", 0) };
        const kindEl = kid(el, "kind");
        const kind = kindEl ? kindEl.textContent.trim() : "major";
        const b = kid(el, "bass");
        const bass = b && txt(b, "bass-step") ? { step: txt(b, "bass-step"), alter: num(b, "bass-alter", 0) } : null;
        const suffix = KIND_SUFFIX[kind] ?? (kindEl?.getAttribute("text") || "");
        const name = `${root.step}${accText(root.alter)}${suffix}${bass ? `/${bass.step}${accText(bass.alter)}` : ""}`;
        const onset = clean(cursor + num(el, "offset", 0) / divisions);
        chords.push({ id: `c${chords.length}`, measure: index, onset, root, kind, bass, name });
      } else if (tag === "barline") {
        const rep = kid(el, "repeat");
        if (rep?.getAttribute("direction") === "forward") measure.repeatStart = true;
        if (rep?.getAttribute("direction") === "backward") {
          measure.repeatEnd = true;
          measure.repeatTimes = Number(rep.getAttribute("times")) || 2;
        }
        if (kid(el, "segno") || kid(el, "coda")) warnIgnored("segno", index);
        const end = kid(el, "ending");
        if (end) {
          const type = end.getAttribute("type");
          const numbers = (end.getAttribute("number") || "")
            .split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0);
          if (type === "start") {
            openEnding = numbers;
            measure.ending = { numbers, type: "start" };
          } else if (type === "stop" || type === "discontinue") {
            measure.ending = { numbers: numbers.length ? numbers : openEnding || [], type };
            openEnding = null;
          }
        }
      } else if (tag === "note") {
        if (kid(el, "cue")) continue;
        if (kid(el, "grace")) {
          warnIgnored("grace", index);
          continue;
        }
        const notations = kids(el, "notations");
        for (const n of notations) {
          if (kid(n, "ornaments")) warnIgnored("ornaments", index);
          if (kid(n, "fermata")) warnIgnored("fermata", index);
        }
        if (kid(el, "lyric")) warnIgnored("lyric", index);

        const isChordTone = !!kid(el, "chord");
        const dur = num(el, "duration", 0) / divisions;
        const onset = isChordTone ? lastOnset : cursor;
        const staff = num(el, "staff", 1) === 2 ? 2 : 1;
        const voice = txt(el, "voice") || "1";
        const p = kid(el, "pitch");
        const rest = !!kid(el, "rest") || !p;
        let pitch = null;
        let midi = null;
        if (!rest) {
          const step = txt(p, "step");
          const alter = num(p, "alter", 0);
          const octave = num(p, "octave", 4);
          pitch = { step, alter, octave };
          midi = (octave + 1) * 12 + SEMITONE[step] + alter;
        }
        const ties = kids(el, "tie");
        const tm = kid(el, "time-modification");
        rawNotes.push({
          measure: index,
          staff,
          voice,
          onset: clean(onset),
          dur: clean(dur),
          rest,
          midi,
          pitch,
          tieStart: ties.some((t) => t.getAttribute("type") === "start"),
          tieStop: ties.some((t) => t.getAttribute("type") === "stop"),
          dots: kids(el, "dot").length,
          tuplet: tm ? { actual: num(tm, "actual-notes", 3), normal: num(tm, "normal-notes", 2) } : null,
        });
        voicesByStaff[staff].add(voice);
        if (!isChordTone) {
          lastOnset = cursor;
          cursor += dur;
        }
        maxPos = Math.max(maxPos, cursor, onset + dur);
      }
    }

    const nominal = (time.beats * 4) / time.beatType;
    measure.length = clean(maxPos > EPS ? maxPos : nominal);
    measures.push(measure);
    for (const s of [1, 2])
      if (voicesByStaff[s].size > 1)
        warnings.push({
          code: "multi_voice",
          message: `第 ${measure.number} 小節${s === 1 ? "右手" : "左手"}有 ${voicesByStaff[s].size} 個聲部，簡譜只畫第一個聲部`,
          measure: index,
        });
  });

  const notes = rawNotes
    .map((n, i) => ({ n, i }))
    .sort((a, b) =>
      a.n.measure - b.n.measure || a.n.staff - b.n.staff || a.n.onset - b.n.onset ||
      (a.n.midi ?? -1) - (b.n.midi ?? -1) || a.i - b.i)
    .map(({ n }, i) => ({ id: `n${i}`, ...n }));

  return {
    title: workTitle,
    composer: composerEl ? composerEl.textContent.trim() || null : null,
    tempo,
    measures,
    notes,
    chords,
    hasChords: chords.length > 0,
    warnings,
  };
}
