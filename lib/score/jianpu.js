// lib/score/jianpu.js — 模型 → 簡譜 SVG（純函式可測；五線譜交給 abcjs，這裡只畫簡譜）
//
// 台灣常見寫法：
//   1-7 唱名、0 休止；高八度在數字上方點、低八度在下方點
//   一拍＝單獨數字；半拍＝數字下一條底線；1/4 拍＝兩條底線（同一拍內的相連音符共用底線）
//   兩拍＝數字後一條橫線，四拍＝三條橫線；附點＝數字右下一點；升降＝數字左上 ♯ ♭
// 每個音符外面包 <g data-idx="n">，播放時靠這個編號高亮（與五線譜共用同一組編號）。
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// 一個音符要畫幾條底線（半拍 1 條、四分之一拍 2 條）
export function beamCount(beats) {
  if (beats >= 1) return 0;
  if (beats >= 0.5) return 1;
  if (beats >= 0.25) return 2;
  return 3;
}
// 一拍以上要補幾條延長線（2 拍 1 條、3 拍 2 條、4 拍 3 條）
export function dashCount(beats) {
  return beats >= 2 ? Math.max(0, Math.round(beats) - 1) : 0;
}
// 附點：base×1.5 且不到兩拍（兩拍以上簡譜用延長線表示，不用附點）
export const isDotted = (beats) => beats < 2 && [0.375, 0.75, 1.5].some((v) => Math.abs(beats - v) < 0.01);

// 把一個小節的音符依「拍」切段，同一段的短音符共用底線
export function groupByBeat(notes) {
  const groups = [];
  let cur = [], pos = 0, acc = 0;
  for (const n of notes) {
    const startBeat = Math.floor(pos + 1e-6);
    if (cur.length && (startBeat !== acc || beamCount(n.beats) === 0)) { groups.push(cur); cur = []; }
    if (beamCount(n.beats) === 0) { groups.push([n]); cur = []; acc = Math.floor(pos + n.beats + 1e-6); }
    else { if (!cur.length) acc = startBeat; cur.push(n); }
    pos += n.beats;
  }
  if (cur.length) groups.push(cur);
  return groups;
}

// model → { svg, height }
export function renderJianpu(model, opts = {}) {
  const {
    width = 760, perRow = 0, showChords = true, showFingering = false,
    pad = 16, numSize = 22, rowGap = 74, fontFamily = '"Noto Sans TC","PingFang TC",sans-serif',
  } = opts;
  const measures = model?.measures || [];
  if (!measures.length) return { svg: "", height: 0 };

  // 每行放幾小節：由「音符最多的那一小節」決定，4/4 的密集小節自動少放幾小節，
  // 不然短音符會擠成一團（純用拍號猜不準，因為同一拍號也有疏密之分）。
  const minNote = numSize * 1.16;                 // 一個唱名數字至少要的水平空間
  const gutter = 26;                              // 小節左右留白（含小節線）
  // 一小節要幾「格」：每個音符一格，兩拍以上的延長線每條也要一格（G6 → 1＋2＝3 格）
  const slots = (m) => m.notes.reduce((a, n) => a + 1 + dashCount(n.beats), 0);
  const maxSlots = measures.reduce((a, m) => Math.max(a, slots(m)), 1);
  const need = maxSlots * minNote + gutter;       // 一小節最少要多寬
  const avail = width - pad * 2;
  const base = width < 460 ? 2 : width < 760 ? 3 : 4;
  const cols = perRow || Math.max(1, Math.min(base, Math.floor(avail / need) || 1));
  const rows = Math.ceil(measures.length / cols);
  const mw = avail / cols;
  const headH = 26;                       // 標頭（1=C 2/4）
  const chordH = showChords ? 18 : 0;
  const height = headH + rows * rowGap + 10;
  const parts = [];

  parts.push(`<text x="${pad}" y="16" font-size="13" fill="currentColor" opacity=".7">1=${esc(model.key?.tonic || "C")}　${model.meter.beats}/${model.meter.unit}</text>`);

  measures.forEach((m, mi) => {
    const r = Math.floor(mi / cols), c = mi % cols;
    const x0 = pad + c * mw;
    const baseline = headH + r * rowGap + chordH + numSize + 6;
    const total = m.notes.reduce((a, n) => a + n.beats, 0) || 1;
    const inner = mw - gutter;
    const unit = inner / total;

    if (showChords && m.chord) {
      parts.push(`<text x="${x0 + 8}" y="${baseline - numSize - 4}" font-size="13" font-weight="700" fill="var(--score-chord,#1e3a8a)">${esc(m.chord)}</text>`);
    }

    // 每個音符的佔寬：照時值比例，但不小於一個數字的寬度；
    // 全部加起來若超出小節（短音符多時會發生），等比縮回去，才不會壓到小節線。
    let ws = m.notes.map((n) => Math.max(minNote, unit * n.beats));
    const sum = ws.reduce((a, b) => a + b, 0);
    if (sum > inner) { const k = inner / sum; ws = ws.map((w) => w * k); }
    let cursor = x0 + 8;
    const placed = m.notes.map((n, ni) => { const w = ws[ni], x = cursor; cursor += w; return { n, x, w }; });

    for (const { n, x, w } of placed) {
      const g = [];
      const label = n.rest ? "0" : String(n.deg);
      if (!n.rest && n.acc) g.push(`<text x="${x - 6}" y="${baseline - 11}" font-size="12" fill="currentColor">${n.acc > 0 ? "♯" : "♭"}</text>`);
      g.push(`<text x="${x}" y="${baseline}" font-size="${numSize}" font-weight="600" fill="currentColor" font-family='${fontFamily}'>${label}</text>`);
      // 八度點
      if (!n.rest && n.oct > 0) for (let k = 0; k < n.oct; k++) g.push(`<circle cx="${x + numSize * 0.28}" cy="${baseline - numSize - 2 - k * 5}" r="1.8" fill="currentColor"/>`);
      if (!n.rest && n.oct < 0) for (let k = 0; k < -n.oct; k++) g.push(`<circle cx="${x + numSize * 0.28}" cy="${baseline + 6 + k * 5}" r="1.8" fill="currentColor"/>`);
      // 延長線與附點
      const dashes = dashCount(n.beats);
      for (let k = 0; k < dashes; k++) g.push(`<text x="${x + (w / (dashes + 1)) * (k + 1)}" y="${baseline}" font-size="${numSize}" fill="currentColor">–</text>`);
      if (isDotted(n.beats)) g.push(`<circle cx="${x + numSize * 0.66}" cy="${baseline - 4}" r="2" fill="currentColor"/>`);
      if (showFingering && n.finger) g.push(`<text x="${x + 1}" y="${baseline - numSize - (showChords && m.chord ? 16 : 6)}" font-size="11" fill="var(--score-finger,#9a5b00)">${esc(n.finger)}</text>`);
      parts.push(`<g data-idx="${n.rest ? -1 : n.index}" class="jp-note">${g.join("")}</g>`);
    }

    // 底線：同一拍內的短音符連起來。第一條橫跨整組；更短的音符（十六分）自己多畫一條，
    // 例如「附點八分＋十六分」是一條長線加一條短線，這是簡譜的標準寫法。
    const tail = (it) => it.x + Math.min(it.w * 0.78, numSize * 0.72);
    let gi = 0;
    for (const group of groupByBeat(m.notes)) {
      const items = group.map(() => placed[gi++]).filter(Boolean);
      if (!items.length) continue;
      const levels = items.map((it) => beamCount(it.n.beats));
      const maxB = Math.max(...levels);
      if (!maxB) continue;
      const line = (x1, x2, b) => {
        const y = baseline + 5 + b * 3.6;
        parts.push(`<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="currentColor" stroke-width="1.4"/>`);
      };
      line(items[0].x - 1, tail(items[items.length - 1]), 0);
      for (let b = 1; b < maxB; b++) {
        // 第 b+1 條：只畫在需要這麼多條的那幾個音符下方（相連的併成一段）
        let run = null;
        items.forEach((it, i) => {
          if (levels[i] > b) run = run ? { ...run, end: it } : { start: it, end: it };
          else if (run) { line(run.start.x - 1, tail(run.end), b); run = null; }
          if (run && i === items.length - 1) { line(run.start.x - 1, tail(run.end), b); run = null; }
        });
      }
    }

    // 小節線（每行最後一小節與全曲最後一小節照畫）
    const bx = x0 + mw - 6;
    const isLast = mi === measures.length - 1;
    parts.push(`<line x1="${bx}" y1="${baseline - numSize - 2}" x2="${bx}" y2="${baseline + 8}" stroke="currentColor" stroke-width="${isLast ? 2.6 : 1.1}" opacity="${isLast ? 1 : 0.55}"/>`);
    if (isLast) parts.push(`<line x1="${bx - 5}" y1="${baseline - numSize - 2}" x2="${bx - 5}" y2="${baseline + 8}" stroke="currentColor" stroke-width="1.1" opacity=".55"/>`);
  });

  const svg = `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="${esc(model.title || "簡譜")}　簡譜" xmlns="http://www.w3.org/2000/svg">${parts.join("")}</svg>`;
  return { svg, height };
}
