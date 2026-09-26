// lib/score/abc.js — ABC 文字譜 →「一份資料」模型（純函式可測）
//
// 為什麼是 ABC：五線譜交給 abcjs 直接吃同一份字串畫，簡譜與播放吃這裡解析出的模型，
// 兩種譜與跟奏都來自同一份來源，後台只要維護這一段文字。
// 只支援教材用得到的子集（單聲部右手旋律）：
//   標頭 X: T: C: M: L: Q: K:
//   音符 A-G a-g、升降 ^ _ =、八度 , '、時值 2 3 /2 /、附點 .（寫成 3/2 也可）
//   休止 z、小節線 | || |] |: :| ::、和弦 "C" "G7" "Am"、連音線 -、換行、%註解
// 不支援的（後台要擋下來並提示）：多聲部 V:、裝飾音、三連音 (3、變拍。
//
// 模型：{ title, subtitle, meter:{beats,unit}, unitLen, tempo, key:{tonic,mode,sharps},
//        measures:[{ chord, notes:[{ rest, midi, deg, oct, acc, beats, tied, index }] }], noteCount }
// deg＝簡譜度數 1-7（0＝休止）、oct＝相對主音八度（0 中央、1 高八度、-1 低八度）、beats＝以四分音符為 1。

const LETTER_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
// 調號的升降記號（大調）：正數＝升記號數、負數＝降記號數
const KEY_SHARPS = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6 };
const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];

export class AbcError extends Error {}

// "1/8" → 0.125；"4/4" → {beats:4, unit:4}
function parseFraction(s, fallback) {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(String(s || ""));
  if (!m) return fallback;
  const n = Number(m[1]), d = Number(m[2]);
  return d > 0 ? n / d : fallback;
}

// K:G / K:Bb / K:Am → { tonic:"G", mode:"major", sharps:1 }
export function parseKey(text) {
  const m = /^\s*([A-G])([#b]?)\s*(maj|major|m|min|minor)?\s*$/i.exec(String(text || "C"));
  if (!m) return { tonic: "C", mode: "major", sharps: 0 };
  const tonic = m[1].toUpperCase() + (m[2] === "#" ? "#" : m[2] === "b" ? "b" : "");
  const minor = /^m(in(or)?)?$/i.test(m[3] || "");
  // 小調用關係大調的調號：Am → C
  const relIdx = minor ? (LETTERS.indexOf(m[1].toUpperCase()) + 2) % 7 : LETTERS.indexOf(m[1].toUpperCase());
  const relTonic = minor ? LETTERS[relIdx] + (m[2] === "#" ? "#" : m[2] === "b" ? "b" : "") : tonic;
  const sharps = KEY_SHARPS[relTonic] ?? 0;
  return { tonic, mode: minor ? "minor" : "major", sharps };
}

// 調號帶來的固定升降：{ F: 1 } 表示所有 F 都升半音
function keyAccidentals(sharps) {
  const acc = {};
  if (sharps > 0) for (let i = 0; i < sharps; i++) acc[SHARP_ORDER[i]] = 1;
  else for (let i = 0; i < -sharps; i++) acc[FLAT_ORDER[i]] = -1;
  return acc;
}

// 音符時值：ABC 的數字／斜線是「單位時值的倍數」
function parseDuration(src, i) {
  let num = "", den = "";
  while (i < src.length && /\d/.test(src[i])) num += src[i++];
  let slashes = 0;
  while (i < src.length && src[i] === "/") { slashes++; i++; }
  while (i < src.length && /\d/.test(src[i])) den += src[i++];
  let mult = num ? Number(num) : 1;
  if (slashes) mult /= den ? Number(den) : Math.pow(2, slashes);
  return [mult, i];
}

export function parseAbc(text) {
  const raw = String(text || "");
  if (!raw.trim()) throw new AbcError("樂譜是空的");
  if (/^\s*V:/m.test(raw)) throw new AbcError("目前只支援單聲部（右手旋律），請移除 V: 多聲部標記");

  const head = { M: "4/4", L: "", K: "C", T: "", C: "", Q: "" };
  const bodyLines = [];
  for (const line of raw.split(/\r?\n/)) {
    const s = line.replace(/%.*$/, "").trimEnd();
    if (!s.trim()) continue;
    const m = /^([A-Za-z]):\s*(.*)$/.exec(s.trim());
    if (m && "XTCMLKQRZNOPSW".includes(m[1].toUpperCase())) { head[m[1].toUpperCase()] = m[2]; continue; }
    bodyLines.push(s);
  }
  if (!bodyLines.length) throw new AbcError("找不到音符，請確認標頭之後有樂句");

  const meterFrac = parseFraction(head.M, 1) || 1;
  const mm = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(head.M) || [, "4", "4"];
  const meter = { beats: Number(mm[1]), unit: Number(mm[2]) };
  // L: 沒寫時照 ABC 慣例：拍號 < 0.75 用 1/16，否則 1/8
  const unitLen = parseFraction(head.L, meterFrac < 0.75 ? 1 / 16 : 1 / 8);
  const key = parseKey(head.K);
  const keyAcc = keyAccidentals(key.sharps);
  const tonicLetter = key.tonic[0];
  const tonicIdx = LETTERS.indexOf(tonicLetter);
  const tonicSemi = LETTER_SEMITONE[tonicLetter] + (key.tonic[1] === "#" ? 1 : key.tonic[1] === "b" ? -1 : 0);

  const tempoM = /(\d+)\s*$/.exec(String(head.Q || "").replace(/^[^=]*=/, ""));
  const tempo = tempoM ? Number(tempoM[1]) : 0;

  const measures = [];
  let cur = { chord: "", notes: [] };
  let barAcc = {};   // 臨時記號只在該小節有效
  let index = 0;     // 全曲第 n 個音符（播放高亮用，休止不算）
  const src = bodyLines.join("\n");

  const pushMeasure = () => { if (cur.notes.length) measures.push(cur); cur = { chord: "", notes: [] }; barAcc = {}; };

  for (let i = 0; i < src.length; ) {
    const ch = src[i];
    if (ch === " " || ch === "\n" || ch === "\t") { i++; continue; }
    if (ch === '"') { // 和弦記號
      const end = src.indexOf('"', i + 1);
      if (end < 0) throw new AbcError('和弦記號的引號沒有成對，請檢查 " 符號');
      const label = src.slice(i + 1, end).trim();
      if (!/^[<>^_@]/.test(label)) cur.chord = cur.chord || label; // 只取小節第一個
      i = end + 1; continue;
    }
    if (ch === "|" || ch === ":") { // 小節線／反覆
      while (i < src.length && "|:[]".includes(src[i])) i++;
      pushMeasure(); continue;
    }
    if (ch === "-") { if (cur.notes.length) cur.notes[cur.notes.length - 1].tied = true; i++; continue; }
    if (ch === "(" || ch === ")" || ch === "[" || ch === "]") { i++; continue; } // 圓滑線／和弦括號：先略過
    if (ch === "z" || ch === "Z" || ch === "x") { // 休止
      let [mult, j] = parseDuration(src, i + 1);
      cur.notes.push({ rest: true, midi: 0, deg: 0, oct: 0, acc: 0, beats: mult * unitLen * 4, tied: false, index: -1 });
      i = j; continue;
    }
    let accMark = 0, seen = false;
    while (i < src.length && "^_=".includes(src[i])) { seen = true; accMark += src[i] === "^" ? 1 : src[i] === "_" ? -1 : 0; i++; }
    const letter = src[i];
    if (!letter || !/[A-Ga-g]/.test(letter)) throw new AbcError(`看不懂的符號「${letter || src[i - 1]}」，只接受 A-G、a-g、z 與小節線`);
    i++;
    let octave = /[a-g]/.test(letter) ? 1 : 0;
    while (i < src.length && (src[i] === "," || src[i] === "'")) { octave += src[i] === "'" ? 1 : -1; i++; }
    let [mult, j] = parseDuration(src, i); i = j;

    const L = letter.toUpperCase();
    if (seen) barAcc[L] = accMark;                       // 本小節之後同名音都跟著變
    const acc = seen ? accMark : (barAcc[L] ?? keyAcc[L] ?? 0);
    const midi = 60 + octave * 12 + LETTER_SEMITONE[L] + acc;
    // 簡譜度數：以主音字母為 1，同時算出相對主音的八度
    const stepsFromTonic = LETTERS.indexOf(L) - tonicIdx + octave * 7;
    const deg = ((stepsFromTonic % 7) + 7) % 7 + 1;
    const oct = Math.floor(stepsFromTonic / 7);
    // 簡譜的升降：與該度數在調內的音相比
    const inKeySemi = (LETTER_SEMITONE[L] + (keyAcc[L] ?? 0) + 12) % 12;
    const actualSemi = (LETTER_SEMITONE[L] + acc + 12) % 12;
    const degAcc = actualSemi === inKeySemi ? 0 : actualSemi > inKeySemi || (inKeySemi - actualSemi) > 6 ? 1 : -1;

    cur.notes.push({ rest: false, midi, deg, oct, acc: degAcc, beats: mult * unitLen * 4, tied: false, index: index++ });
  }
  pushMeasure();
  if (!measures.length) throw new AbcError("找不到任何音符");

  return {
    title: head.T.trim(), subtitle: head.C.trim(),
    meter, unitLen, tempo, key, tonicMidi: 60 + tonicSemi,
    measures, noteCount: index,
  };
}

// 後台存檔前的檢查：回 { ok, error, model, warnings[] }
export function validateAbc(text) {
  try {
    const model = parseAbc(text);
    const warnings = [];
    const perMeasure = model.meter.beats * (4 / model.meter.unit);
    model.measures.forEach((m, i) => {
      const sum = m.notes.reduce((a, n) => a + n.beats, 0);
      // 第一小節允許弱起、最後一小節允許不足
      if (i > 0 && i < model.measures.length - 1 && Math.abs(sum - perMeasure) > 0.01) {
        warnings.push(`第 ${i + 1} 小節有 ${+sum.toFixed(2)} 拍，拍號是每小節 ${perMeasure} 拍`);
      }
    });
    return { ok: true, error: "", model, warnings };
  } catch (e) {
    return { ok: false, error: e instanceof AbcError ? e.message : "樂譜解析失敗", model: null, warnings: [] };
  }
}
