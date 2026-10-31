// lib/score/jianpu-grand.js — v2 模型 → 雙行簡譜 SVG（純函式可測）
//
// 每個系統（一行樂譜）：上面一列放調號／拍號變更與和弦，接著右手行、左手行，兩行小節線對齊。
// 同一隻手同一拍同時按的音上下堆疊（高音在上）。橫向位置依「拍」對齊：右手與左手同一拍的音 x 相同。
// 寫法沿用 jianpu.js（底線、延長線、附點、八度點、升降），共用它的 beamCount／dashCount／isDotted／groupByBeat。
// 每個音符包 <g class="jp-note" data-id="n12">、和弦包 <g class="jp-chord" data-chord="c3">，高亮與提示框靠這兩個屬性。
// 多聲部小節只畫該手的第一個聲部（匯入時已警告）。

import { beamCount, dashCount, isDotted, groupByBeat } from "./jianpu.js";
import { jianpuDigit, romanOf } from "./chords.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const r1 = (x) => Math.round(x * 10) / 10;
const EPS = 1e-6;
const KEY_NAMES = ["C♭", "G♭", "D♭", "A♭", "E♭", "B♭", "F", "C", "G", "D", "A", "E", "B", "F♯", "C♯"];
const keyLabel = (key) => `1=${KEY_NAMES[Math.max(-7, Math.min(7, key?.fifths || 0)) + 7]}`;
const timeLabel = (t) => `${t.beats}/${t.beatType}`;

// 一個小節某隻手的「直欄」：同一拍的音（只取第一聲部）堆成一欄
function columnsOf(notes) {
  if (!notes.length) return [];
  const voice = notes.map((n) => n.voice).sort((a, b) => Number(a) - Number(b) || String(a).localeCompare(String(b)))[0];
  const cols = [];
  for (const n of notes) {
    if (n.voice !== voice) continue;
    const last = cols[cols.length - 1];
    if (last && Math.abs(last.onset - n.onset) < EPS) last.notes.push(n);
    else cols.push({ onset: n.onset, beats: n.dur, notes: [n] });
  }
  for (const c of cols) c.notes.sort((a, b) => (b.midi ?? 0) - (a.midi ?? 0)); // 高音在上
  return cols;
}

const MUTED = "#6E6E73"; // 原型 --muted

export function renderGrandJianpu(model, opts = {}) {
  const {
    width = 760, chordMode = "name", showChords = true, rightHandOnly = false, slashes = false,
    pad = 16, numSize = 19, fontFamily = '-apple-system,BlinkMacSystemFont,"SF Pro Display","Helvetica Neue","PingFang TC","Noto Sans TC",sans-serif',

  } = opts;
  const measures = model?.measures || [];
  if (!measures.length) return { svg: "", height: 0, rows: 0 };
  const staves = rightHandOnly ? [1] : [1, 2];
  const withChords = showChords && model.hasChords && (model.chords || []).length > 0;

  // ── 每小節的資料 ──
  const byMeasure = measures.map(() => ({ 1: [], 2: [] }));
  for (const n of model.notes) byMeasure[n.measure]?.[n.staff]?.push(n);
  const chordsBy = measures.map(() => []);
  if (withChords) for (const c of model.chords) chordsBy[c.measure]?.push(c);

  const minNote = numSize * 1.2;
  const gutter = 18;
  const info = measures.map((m, mi) => {
    const cols = { 1: columnsOf(byMeasure[mi][1]), 2: rightHandOnly ? [] : columnsOf(byMeasure[mi][2]) };
    // 格點：音符起點（最小寬一個數字）、延長線的整拍位置（較窄）、和弦起點
    const pts = new Map(); // pos → 最小寬
    const add = (p, w) => {
      const k = Math.round(p * 1000) / 1000;
      if (k < m.length - EPS) pts.set(k, Math.max(pts.get(k) || 0, w));
    };
    for (const s of staves)
      for (const c of cols[s]) {
        add(c.onset, minNote);
        for (let k = 1; k <= dashCount(c.beats); k++) add(c.onset + k, minNote * 0.7);
      }
    for (const c of chordsBy[mi]) add(c.onset, minNote);
    add(0, minNote * 0.5);
    const grid = [...pts.keys()].sort((a, b) => a - b);
    const minW = grid.reduce((a, p) => a + pts.get(p), 0);
    return { m, cols, grid, pts, need: minW + gutter };
  });

  // 左邊留一欄寫列名「右／左／節奏」（原型 rowlab）
  const labelW = 26;
  const avail = width - pad * 2 - labelW;
  const need = Math.max(...info.map((x) => x.need));
  const base = width < 460 ? 2 : width < 760 ? 3 : 4;
  const perRow = Math.max(1, Math.min(base, Math.floor(avail / need) || 1));
  const rows = Math.ceil(measures.length / perRow);
  const mw = avail / perRow;

  // 每隻手最多疊幾個音，決定行高
  const maxStack = { 1: 1, 2: 1 };
  for (const x of info) for (const s of staves) for (const c of x.cols[s]) maxStack[s] = Math.max(maxStack[s], c.notes.length);
  const stackGap = numSize + 13; // 留給上方高八度點與下方低八度點
  const rowH = (s) => numSize + (maxStack[s] - 1) * stackGap + 22; // 上方八度點＋下方底線與低八度點
  const headH = 8; // 調號、拍號已在樂譜標題列，不重複
  const labelH = 14;
  const chordH = withChords ? 20 : 0;
  const staffGap = 6;
  // Lead Sheet 的節奏斜線（照原型 slashSVG）：只看右手時在右手下面多一列，照左手（原譜或自動伴奏）的節奏畫斜線符頭，
  // 二分以上空心、全音符不畫符桿、同一拍內相連的八分音符連桿、單獨的八分音符加符尾。沒有左手就不畫。
  const slashOn = rightHandOnly && slashes && model.notes.some((n) => n.staff === 2 && !n.rest);
  const slashH = slashOn ? 36 : 0;
  const sysH = labelH + chordH + staves.reduce((a, s) => a + rowH(s), 0) + (staves.length - 1) * staffGap + slashH;
  const sysGap = 16;
  const height = headH + rows * (sysH + sysGap);
  const parts = [];


  const noteXs = new Map(); // id → { x, baseline, row }
  const bars = []; // 每小節的位置（游標、A-B 循環底色、點小節號用）：{ x0, x1, top, bottom, xAt }
  const rowLab = (x, y, t) => parts.push(`<text class="jp-rowlab" x="${x}" y="${r1(y)}" font-size="11" fill="${MUTED}" font-family='${fontFamily}'>${t}</text>`);
  const tieStarts = [];
  info.forEach((x, mi) => {
    const { m, cols, grid, pts } = x;
    const row = Math.floor(mi / perRow);
    const c = mi % perRow;
    const x0 = pad + labelW + c * mw;
    const top = headH + row * (sysH + sysGap);
    const inner = mw - gutter;

    // 拍 → x：每格寬＝max(最小寬, 時值比例)，總和縮放到小節內寬
    const unit = inner / Math.max(m.length, EPS);
    const ws = grid.map((p, i) => Math.max(pts.get(p), unit * ((grid[i + 1] ?? m.length) - p)));
    const k = inner / ws.reduce((a, b) => a + b, 0);
    const starts = [];
    let acc = x0 + 8;
    ws.forEach((w) => {
      starts.push(acc);
      acc += w * k;
    });
    const xAt = (p) => {
      let i = grid.length - 1;
      while (i > 0 && grid[i] > p + EPS) i--;
      const seg = (grid[i + 1] ?? m.length) - grid[i] || 1;
      return r1(starts[i] + ((p - grid[i]) / seg) * ws[i] * k);
    };

    // 調號／拍號變更標示
    const prev = measures[mi - 1];
    const labels = [];
    if (prev && prev.key.fifths !== m.key.fifths) labels.push(keyLabel(m.key));
    if (prev && (prev.time.beats !== m.time.beats || prev.time.beatType !== m.time.beatType)) labels.push(timeLabel(m.time));
    if (m.ending && (!prev?.ending || prev.ending.numbers.join() !== m.ending.numbers.join() || m.ending.type === "start" && prev.ending.type !== "start"))
      labels.push(`${m.ending.numbers.join(".")}.`);
    // 小節號：每小節上方小號灰字，點了從這小節開始播（原型 barno）
    parts.push(`<text class="jp-barno" data-barno="${mi}" x="${r1(x0 + 3)}" y="${top + 10}" font-size="10" fill="${MUTED}">${esc(m.implicit && mi === 0 ? "弱" : m.number)}</text>`);
    if (labels.length) parts.push(`<text class="jp-label" x="${r1(x0 + 22)}" y="${top + 11}" font-size="11" fill="currentColor" opacity=".75">${esc(labels.join("　"))}</text>`);

    // 和弦
    if (withChords) {
      const cy = top + labelH + 14;
      for (const ch of chordsBy[mi]) {
        const roman = romanOf(ch, m.key);
        // 原型：和弦名 15px／600、強調色；級數一律灰色，「兩者」時接在和弦名後面
        const rn = (dx) => `<tspan class="jp-rn" ${dx ? 'dx="5" font-size="13"' : ""} fill="${MUTED}">${esc(roman)}</tspan>`;
        const inner2 =
          chordMode === "roman" ? rn(false)
          : chordMode === "both" && ch.kind !== "none" ? `${esc(ch.name)}${rn(true)}`
          : esc(ch.name);
        parts.push(`<g class="jp-chord" data-chord="${esc(ch.id)}"><text x="${xAt(ch.onset)}" y="${cy}" font-size="15" font-weight="600" fill="var(--score-chord,#007AFF)" font-family='${fontFamily}'>${inner2}</text></g>`);
      }
    }

    // 兩隻手
    let rowTop = top + labelH + chordH;
    const lineTop = rowTop;
    for (const s of staves) {
      const baseline0 = rowTop + 8 + numSize; // 上方留八度點空間
      const fs = s === 2 ? Math.round(numSize * 0.84) : numSize; // 原型：右手 19、左手 16
      if (c === 0) rowLab(pad - 12, baseline0 - 4, s === 1 ? "右" : "左");
      for (const col of cols[s]) {
        const x = xAt(col.onset);
        col.x = x;
        col.notes.forEach((n, si) => {
          const baseline = baseline0 + si * stackGap;
          const g = [];
          if (n.rest) {
            g.push(`<text class="jp-num" x="${x}" y="${baseline}" font-size="${fs}" font-weight="700" fill="currentColor" font-family='${fontFamily}'>0</text>`);
          } else {
            const d = jianpuDigit(n.pitch, m.key);
            if (d.acc) g.push(`<text x="${r1(x - 7)}" y="${baseline - 10}" font-size="11" fill="currentColor">${esc(d.acc)}</text>`);
            g.push(`<text class="jp-num" x="${x}" y="${baseline}" font-size="${fs}" font-weight="700" fill="currentColor" font-family='${fontFamily}'>${esc(d.digit)}</text>`);
            const cx = r1(x + numSize * 0.28);
            for (let o = 0; o < d.octave; o++) g.push(`<circle cx="${cx}" cy="${baseline - numSize - 1 - o * 4.5}" r="1.7" fill="currentColor"/>`);
            // 低八度點在底線之下（只有最下面那個音有底線）
            const below = si === col.notes.length - 1 ? beamCount(col.beats) * 3.6 : 0;
            for (let o = 0; o < -d.octave; o++) g.push(`<circle cx="${cx}" cy="${r1(baseline + 7 + below + o * 4.5)}" r="1.7" fill="currentColor"/>`);
          }
          if (isDotted(col.beats)) g.push(`<circle cx="${r1(x + numSize * 0.7)}" cy="${baseline - 4}" r="1.9" fill="currentColor"/>`);
          parts.push(`<g class="jp-note${s === 2 ? " lh" : ""}" data-id="${esc(n.id)}">${g.join("")}</g>`);
          noteXs.set(n.id, { x, baseline, row });
          if (n.tieStart) tieStarts.push(n);
        });
        // 延長線（每拍一條，放在拍點上）
        const lowBase = baseline0 + (col.notes.length - 1) * stackGap;
        for (let d = 1; d <= dashCount(col.beats); d++)
          parts.push(`<line class="jp-dash" x1="${r1(xAt(col.onset + d) + numSize * 0.28 - 5)}" y1="${baseline0 - 6}" x2="${r1(xAt(col.onset + d) + numSize * 0.28 + 5)}" y2="${baseline0 - 6}" stroke="currentColor" stroke-width="2"/>`);
        col.lowBase = lowBase;
      }

      // 底線：同一拍內的短音符共用
      const tail = (cl) => cl.x + numSize * 0.66;
      for (const group of groupByBeat(cols[s])) {
        const maxB = Math.max(...group.map((cl) => beamCount(cl.beats)));
        if (!maxB) continue;
        const y0 = Math.max(...group.map((cl) => cl.lowBase)) + 4;
        const line = (x1, x2, b) => parts.push(`<line x1="${r1(x1)}" y1="${r1(y0 + b * 3.6)}" x2="${r1(x2)}" y2="${r1(y0 + b * 3.6)}" stroke="currentColor" stroke-width="1.3"/>`);
        line(group[0].x - 1, tail(group[group.length - 1]), 0);
        for (let b = 1; b < maxB; b++) {
          let run = null;
          group.forEach((cl, i) => {
            const deep = beamCount(cl.beats) > b;
            if (deep) run = run ? [run[0], cl] : [cl, cl];
            if (run && (!deep || i === group.length - 1)) {
              line(run[0].x - 1, tail(run[1]), b);
              run = null;
            }
          });
        }
      }

      // 三連音：連續 tuplet 音每 actual 個一組，標一個 3
      const tcols = cols[s].filter((cl) => cl.notes[0].tuplet);
      for (let i = 0; i < tcols.length; ) {
        const n0 = tcols[i].notes[0].tuplet.actual || 3;
        const grp = tcols.slice(i, i + n0);
        const cx = r1((grp[0].x + grp[grp.length - 1].x) / 2 + numSize * 0.3);
        parts.push(`<text class="jp-tuplet" x="${cx}" y="${baseline0 - numSize - 2}" font-size="10" font-style="italic" fill="currentColor" text-anchor="middle">${n0}</text>`);
        i += n0;
      }
      rowTop += rowH(s) + staffGap;
    }

    if (slashOn) {
      const y = rowTop - staffGap + slashH - 9; // 符頭中心；符桿往上
      const stemTop = y - 22;
      if (c === 0) rowLab(pad - 12, y + 4, "節奏");
      parts.push(`<line class="jp-slash-line" x1="${r1(x0 + 4)}" y1="${r1(y)}" x2="${r1(x0 + mw - 4)}" y2="${r1(y)}" stroke="currentColor" stroke-width="1" opacity=".25"/>`);
      const evs = [];
      for (const n of byMeasure[mi][2]) {
        if (n.rest || n.tieStop) continue;
        const e = evs.find((v) => Math.abs(v.onset - n.onset) < EPS);
        if (e) e.dur = Math.max(e.dur, n.dur);
        else evs.push({ onset: n.onset, dur: n.dur, ids: [] });
        (e || evs[evs.length - 1]).ids.push(n.id);
      }
      evs.sort((a, b) => a.onset - b.onset);
      const eighth = (e) => Math.abs(e.dur - 0.5) < EPS;
      const beamed = new Set();
      for (let i = 0; i < evs.length; i++) {
        const run = [evs[i]];
        while (
          eighth(run[run.length - 1]) && evs[i + run.length] && eighth(evs[i + run.length]) &&
          Math.floor(evs[i + run.length].onset + EPS) === Math.floor(run[0].onset + EPS) &&
          Math.abs(run[run.length - 1].onset + 0.5 - evs[i + run.length].onset) < EPS
        ) run.push(evs[i + run.length]);
        if (run.length > 1 && eighth(run[0])) {
          const xa = xAt(run[0].onset) + 5.6, xb = xAt(run[run.length - 1].onset) + 5.6;
          parts.push(`<line class="jp-slash-beam" x1="${r1(xa)}" y1="${r1(stemTop)}" x2="${r1(xb)}" y2="${r1(stemTop)}" stroke="currentColor" stroke-width="3"/>`);
          run.forEach((e) => beamed.add(e));
          i += run.length - 1;
        }
      }
      for (const e of evs) {
        const x = xAt(e.onset) + 6;
        const hollow = e.dur >= 2 - EPS;
        const pts = `${r1(x - 6)},${r1(y + 5)} ${r1(x - 2)},${r1(y + 5)} ${r1(x + 6)},${r1(y - 5)} ${r1(x + 2)},${r1(y - 5)}`;
        let g = `<polygon points="${pts}" fill="${hollow ? "none" : "currentColor"}" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>`;
        if (e.dur < 4 - EPS) g += `<line x1="${r1(x + 5.6)}" y1="${r1(y - 4)}" x2="${r1(x + 5.6)}" y2="${r1(stemTop)}" stroke="currentColor" stroke-width="1.3"/>`;
        if (eighth(e) && !beamed.has(e)) g += `<path d="M${r1(x + 5.6)} ${r1(stemTop)} q 6 6 4 14" fill="none" stroke="currentColor" stroke-width="1.5"/>`;
        if ([3, 1.5, 0.75].some((d) => Math.abs(e.dur - d) < EPS)) g += `<circle cx="${r1(x + 10)}" cy="${r1(y + 2)}" r="1.8" fill="currentColor"/>`;
        parts.push(`<g class="jp-slash" data-ids="${e.ids.join(" ")}">${g}</g>`);
      }
      rowTop += slashH;
    }

    // 小節線（兩行對齊）＋反覆記號
    const lineBottom = rowTop - staffGap - 4;
    bars[mi] = { x0, x1: x0 + mw, top: top + labelH, bottom: lineBottom + 4, row, xAt };
    const xr = r1(x0 + mw - 4);
    if (mi === measures.length - 1 && !m.repeatEnd) {
      parts.push(`<line x1="${r1(xr - 5)}" y1="${lineTop + 4}" x2="${r1(xr - 5)}" y2="${lineBottom}" stroke="currentColor" stroke-width="1.2"/>`);
      parts.push(`<line x1="${r1(xr)}" y1="${lineTop + 4}" x2="${r1(xr)}" y2="${lineBottom}" stroke="currentColor" stroke-width="4"/>`);
    } else parts.push(`<line x1="${xr}" y1="${lineTop + 4}" x2="${xr}" y2="${lineBottom}" stroke="currentColor" stroke-width="${m.repeatEnd ? 2.4 : 1.2}"/>`);
    if (m.repeatEnd) parts.push(`<text x="${r1(xr - 8)}" y="${r1((lineTop + lineBottom) / 2 + 4)}" font-size="13" fill="currentColor">:</text>`);
    if (m.repeatStart) {
      const xl = r1(x0 + 2);
      parts.push(`<line x1="${xl}" y1="${lineTop + 4}" x2="${xl}" y2="${lineBottom}" stroke="currentColor" stroke-width="2.4"/>`);
      parts.push(`<text x="${r1(xl + 3)}" y="${r1((lineTop + lineBottom) / 2 + 4)}" font-size="13" fill="currentColor">:</text>`);
    }
  });

  // 連結線：同一行就畫完整弧線，跨行就畫半條
  for (const n of tieStarts) {
    const a = noteXs.get(n.id);
    const next = model.notes.find((o) => o.tieStop && o.staff === n.staff && o.midi === n.midi &&
      (o.measure > n.measure || (o.measure === n.measure && o.onset > n.onset)));
    const b = next && noteXs.get(next.id);
    const y = a.baseline - numSize - 3;
    const x1 = a.x + numSize * 0.3;
    const x2 = b && b.row === a.row ? b.x + numSize * 0.3 : x1 + 22;
    parts.push(`<path d="M${r1(x1)} ${r1(y)} Q${r1((x1 + x2) / 2)} ${r1(y - 7)} ${r1(x2)} ${r1(y)}" fill="none" stroke="currentColor" stroke-width="1.1"/>`);
  }

  const svg = `<svg class="jp-grand" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="${esc(model.title || "簡譜")}　簡譜" xmlns="http://www.w3.org/2000/svg">${parts.join("")}</svg>`;
  return { svg, height, rows, bars };
}
