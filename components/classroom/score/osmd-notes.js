// components/classroom/score/osmd-notes.js — 從 OSMD 畫好的 GraphicSheet 收集每個音符的 (小節, staff, onset, midi, SVG 元素)
// 交給 lib/score/staff-xml.js 的 matchStaffNotes 對回模型 id。純函式（只讀物件屬性），可用假物件測試。
//
// OSMD 的 Note.halfTone 以 C4＝48 計（比 MIDI 少一個八度）。2026-10-29 在瀏覽器用小蜜蜂第一個音校正：
// G4 → halfTone 55 → MIDI 67，所以加 12。
export const OSMD_HALFTONE_TO_MIDI = 12;

export function collectOsmdNotes(graphic) {
  const out = [];
  const list = graphic?.MeasureList || [];
  list.forEach((staves, measure) => {
    (staves || []).forEach((gm, s) => {
      if (!gm) return;
      for (const se of gm.staffEntries || []) {
        const onset = (se.relInMeasureTimestamp?.RealValue ?? 0) * 4;
        for (const gve of se.graphicalVoiceEntries || []) {
          if (gve.parentVoiceEntry?.IsGrace) continue;
          for (const gn of gve.notes || []) {
            const sn = gn.sourceNote;
            if (!sn || sn.IsGraceNote) continue;
            const rest = typeof sn.isRest === "function" ? sn.isRest() : false;
            out.push({
              measure,
              staff: s + 1,
              onset,
              midi: rest ? null : sn.halfTone + OSMD_HALFTONE_TO_MIDI,
              el: typeof gn.getSVGGElement === "function" ? gn.getSVGGElement() : null,
            });
          }
        }
      }
    });
  });
  return out;
}

// 每小節的位置（像素，相對於 OSMD 的 SVG 左上角）＋和弦文字的可點範圍，給游標、A-B 循環底色、小節號、和弦提示框用。
// OSMD 內部單位 1＝10px×zoom。xAt(拍)：依該小節右手各音的 x 內插，最後一拍接到小節線前。
// 分頁模式（A4，每頁一張 SVG）時座標相對於「該頁」SVG 左上角，page＝第幾頁（0 起），StaffView 依此加上各頁位移。
export const OSMD_UNIT_PX = 10;
export function osmdGeometry(graphic, model, zoom = 1) {
  const u = OSMD_UNIT_PX * zoom;
  const bars = [];
  const chords = [];
  const seen = new Set();
  const pages = graphic?.MusicPages || [];
  const pageOf = (gm) => Math.max(0, pages.indexOf(gm?.ParentMusicSystem?.Parent));
  (graphic?.MeasureList || []).forEach((staves, mi) => {
    const list = (staves || []).filter(Boolean);
    if (!list.length) return;
    const first = list[0].PositionAndShape;
    const last = list[list.length - 1].PositionAndShape;
    const x0 = first.AbsolutePosition.x * u;
    const x1 = x0 + first.Size.width * u;
    const top = first.AbsolutePosition.y * u;
    const bottom = (last.AbsolutePosition.y + 4) * u;
    const len = model?.measures?.[mi]?.length ?? 4;
    const pts = [];
    for (const se of list[0].staffEntries || []) {
      const on = (se.relInMeasureTimestamp?.RealValue ?? 0) * 4;
      if (!pts.some((p) => Math.abs(p[0] - on) < 1e-6)) pts.push([on, se.PositionAndShape.AbsolutePosition.x * u]);
    }
    pts.sort((a, b) => a[0] - b[0]);
    if (!pts.length || pts[0][0] > 1e-6) pts.unshift([0, x0 + 12]);
    pts.push([len, x1 - 8]);
    const xAt = (pos) => {
      let i = 0;
      while (i < pts.length - 2 && pts[i + 1][0] <= pos) i++;
      const [a, xa] = pts[i];
      const [b, xb] = pts[i + 1];
      return b - a > 1e-6 ? xa + ((Math.min(pos, b) - a) / (b - a)) * (xb - xa) : xa;
    };
    const page = pageOf(list[0]);
    bars[mi] = { x0, x1, top, bottom, xAt, page, row: page * 1e6 + Math.round(top) };
    for (const gm of list)
      for (const se of gm.staffEntries || [])
        for (const cc of se.graphicalChordContainers || []) addChord(mi, (se.relInMeasureTimestamp?.RealValue ?? 0) * 4, cc.PositionAndShape, page);
  });
  // prepareStaffXml 把和弦寫成 <words>，OSMD 畫成各行的文字標記（AbstractExpressions），時間點是小節內的全音符單位
  pages.forEach((pg, page) => {
    for (const sys of pg.MusicSystems || [])
      for (const sl of sys.StaffLines || [])
        for (const e of sl.AbstractExpressions || []) {
          const me = e.sourceMultiExpression;
          const mi = me?.SourceMeasureParent?.measureListIndex;
          if (mi == null) continue;
          addChord(mi, (me.Timestamp?.RealValue ?? 0) * 4, e.label?.PositionAndShape, page);
        }
  });
  return { bars, chords };

  function addChord(mi, on, ps, page = 0) {
    const c = (model?.chords || []).find((ch) => ch.measure === mi && Math.abs(ch.onset - on) < 1e-6 && !seen.has(ch.id));
    if (!c || !ps) return;
    seen.add(c.id);
    chords.push({
      id: c.id,
      page,
      x: (ps.AbsolutePosition.x + ps.BorderLeft) * u,
      y: (ps.AbsolutePosition.y + ps.BorderTop) * u,
      w: Math.max(18, (ps.BorderRight - ps.BorderLeft) * u),
      h: Math.max(14, (ps.BorderBottom - ps.BorderTop) * u),
    });
  }
}

// 一行幾小節：固定 4 小節換行（OSMD 預設是排滿才換，每行小節數不一、看起來不整齊；2026-10-31 Alan 定）。
// 手機寬度（<460px）4 小節會擠到音符疊在一起，改 2 小節——與簡譜（lib/score/jianpu*.js）同一個門檻。
export function measuresPerLine(width) {
  return width > 0 && width < 460 ? 2 : 4;
}

// 每次畫之前套用的排版規則
// paged：A4 分頁模式，每頁上方留空間放曲名列（StaffView 疊上去），左右邊界加寬像真的紙
// 小節一律等寬（OSMD 預設依音符多寡分配寬度，各行小節線上下對不齊；2026-10-31 Alan 要求對齊整齊）。
// 弱起小節不套用，否則一兩個音會被拉滿整小節；每行第一小節仍會多出譜號（第一行還有拍號）的寬度。
export function applyEngravingRules(rules, width, { paged = false } = {}) {
  rules.RenderXMeasuresPerLineAkaSystem = measuresPerLine(width);
  rules.FixedMeasureWidth = true;
  rules.FixedMeasureWidthUseForPickupMeasures = false;
  if (paged) {
    rules.PageTopMargin = 9;
    rules.PageTopMarginNarrow = 9;
    rules.PageBottomMargin = 6;
    rules.PageLeftMargin = 6;
    rules.PageRightMargin = 6;
  }
}

// 和弦字與下方音符（符頭／符桿／連桿）至少要隔幾 px。
// 和弦是 prepareStaffXml 改寫成的 <words>，OSMD 以估算的文字框貼著 skyline 放、沒有間距可調，
// 瀏覽器實際畫出的字比估算的低，高音（加線上的 G5）或往上的連桿就跟「C I」貼在一起（2026-10-31 Alan 回報）。
// 所以畫完再量：太近的和弦字往上抬。
export const CHORD_MIN_GAP_PX = 6;
// 和弦字（和弦名或級數，例：「C I」「G7 (V7)」「vi」）；指法數字不算
const CHORD_TEXT = /^([A-G][#b♯♭]?|[♭#]?(?:i{1,3}|iv|vi{0,2}|I{1,3}|IV|VI{0,2})\b)/;

// rect 皆為 { left, right, top, bottom }（螢幕 px）。回傳每個和弦字要往上移的量（≤0）。
export function chordLifts(textRects, inkRects, minGap = CHORD_MIN_GAP_PX) {
  return textRects.map((t) => {
    let gap = Infinity;
    for (const r of inkRects) {
      if (r.right <= t.left - 1 || r.left >= t.right + 1) continue;     // 水平沒重疊
      if (r.bottom <= t.top || r.top >= t.bottom + 3 * minGap) continue; // 在字上方、或離很遠
      gap = Math.min(gap, r.top - t.bottom);
    }
    return gap < minGap ? gap - minGap : 0;
  });
}

// 在 OSMD 畫好的 SVG 上把太近的和弦字往上抬；回傳 [{ rect（抬之前）, dy（螢幕 px）}] 供 StaffView 同步調整可點範圍
export function liftChordLabels(svg, k = 1) {
  const texts = [...svg.querySelectorAll("text")].filter((t) => CHORD_TEXT.test((t.textContent || "").trim()));
  if (!texts.length) return [];
  const rects = texts.map((t) => t.getBoundingClientRect());
  const ink = [...svg.querySelectorAll(".vf-stavenote, .vf-beam")].map((e) => e.getBoundingClientRect());
  const dys = chordLifts(rects, ink);
  const out = [];
  texts.forEach((t, i) => {
    if (!dys[i]) return;
    t.setAttribute("y", String(Number(t.getAttribute("y") || 0) + dys[i] / k));
    out.push({ rect: rects[i], dy: dys[i] });
  });
  return out;
}

// OSMD 設定（StaffView 用）。連桿不用 OSMD 的 autoBeam（它把拍號分母當一拍，6/8 的八分音符連不起來），
// 改由 lib/score/staff-xml.js 的 prepareStaffXml 依樂理補 <beam>；原檔寫好的連桿照原檔。
// autoResize 關掉：寬度改變由 StaffView 自己重畫並重建音符對照表。
export const OSMD_OPTIONS = {
  backend: "svg",
  autoResize: false,
  autoBeam: false,
  drawTitle: false,
  drawSubtitle: false,
  drawComposer: false,
  drawLyricist: false,
  drawPartNames: false,
  drawingParameters: "compacttight",
  drawMeasureNumbers: false, // 小節號由 StaffView 自己疊上去（可點、從該小節開始播）
};
