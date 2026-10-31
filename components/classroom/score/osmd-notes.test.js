import { describe, it, expect } from "vitest";
import { collectOsmdNotes, OSMD_HALFTONE_TO_MIDI, OSMD_OPTIONS, osmdGeometry, applyEngravingRules } from "./osmd-notes.js";

// 假的 OSMD GraphicSheet：兩小節 × 兩行譜，含一個和弦、一個休止、一個裝飾音
const note = (halfTone, el, { rest = false, grace = false } = {}) => ({
  sourceNote: { halfTone, isRest: () => rest, IsGraceNote: grace },
  getSVGGElement: () => el,
});
const entry = (real, notes, grace = false) => ({
  relInMeasureTimestamp: { RealValue: real },
  graphicalVoiceEntries: [{ parentVoiceEntry: { IsGrace: grace }, notes }],
});
const G4 = 67 - OSMD_HALFTONE_TO_MIDI;
const graphic = {
  MeasureList: [
    [
      { staffEntries: [entry(0, [note(G4, "g4")]), entry(0.25, [note(G4 - 3, "e4")])] },
      { staffEntries: [entry(0, [note(48 - OSMD_HALFTONE_TO_MIDI, "c3"), note(52 - OSMD_HALFTONE_TO_MIDI, "chord"), note(55 - OSMD_HALFTONE_TO_MIDI, "chord")])] },
    ],
    [
      { staffEntries: [entry(0, [note(0, "rest", { rest: true })]), entry(0, [note(G4 + 2, "grace", { grace: true })], true)] },
      undefined,
    ],
  ],
};

describe("collectOsmdNotes", () => {
  const out = collectOsmdNotes(graphic);
  it("筆數（裝飾音與空小節略過）", () => expect(out.length).toBe(6));
  it("第一個音：小節 0、右手、onset 0、G4", () => expect(out[0]).toEqual({ measure: 0, staff: 1, onset: 0, midi: 67, el: "g4" }));
  it("onset 以四分音符為單位", () => expect(out[1].onset).toBe(1));
  it("左手和弦三個音", () => {
    const lh = out.filter((n) => n.staff === 2);
    expect(lh.map((n) => n.midi)).toEqual([48, 52, 55]);
    expect(lh.every((n) => n.onset === 0 && n.measure === 0)).toBe(true);
  });
  it("休止 midi 為 null", () => expect(out[5]).toEqual({ measure: 1, staff: 1, onset: 0, midi: null, el: "rest" }));
  it("OSMD 實際的 halfTone：G4＝55（瀏覽器實測）→ MIDI 67", () => {
    const g = { MeasureList: [[{ staffEntries: [entry(0, [note(55, "x")])] }]] };
    expect(collectOsmdNotes(g)[0].midi).toBe(67);
  });
  it("壞資料不丟例外", () => expect(collectOsmdNotes(null)).toEqual([]));
});

describe("OSMD_OPTIONS", () => {
  it("不用 OSMD 的 autoBeam（6/8 會連錯），連桿由 prepareStaffXml 補", () => {
    expect(OSMD_OPTIONS.autoBeam).toBe(false);
  });
  it("關掉 OSMD 自己的 autoResize（由 StaffView 重畫並重建對照表）", () => {
    expect(OSMD_OPTIONS.autoResize).toBe(false);
    expect(OSMD_OPTIONS.backend).toBe("svg");
  });
});

describe("osmdGeometry", () => {
  const ps = (x, y, w = 0, b = {}) => ({ AbsolutePosition: { x, y }, Size: { width: w }, BorderLeft: 0, BorderRight: 2, BorderTop: -1, BorderBottom: 0, ...b });
  const se = (on, x, chords) => ({ relInMeasureTimestamp: { RealValue: on / 4 }, PositionAndShape: ps(x, 0), graphicalChordContainers: chords || [] });
  const graphic = {
    MeasureList: [[{ PositionAndShape: ps(1, 5, 20), staffEntries: [se(0, 3, [{ PositionAndShape: ps(3, 2) }]), se(2, 11)] }]],
  };
  const model = { measures: [{ length: 4 }], chords: [{ id: "c0", measure: 0, onset: 0 }] };
  it("小節位置、拍點內插、和弦可點範圍（單位換算 10px）", () => {
    const { bars, chords } = osmdGeometry(graphic, model, 1);
    expect(bars[0]).toMatchObject({ x0: 10, x1: 210, top: 50, bottom: 90 });
    expect(bars[0].xAt(0)).toBe(30);
    expect(bars[0].xAt(1)).toBe(70);
    expect(bars[0].xAt(4)).toBe(202);
    expect(chords).toEqual([{ id: "c0", page: 0, x: 30, y: 10, w: 20, h: 14 }]);
  });
});

describe("osmdGeometry：和弦寫成 words 的文字標記", () => {
  it("從各行 AbstractExpressions 找回模型和弦", () => {
    const ps = { AbsolutePosition: { x: 4, y: 1 }, Size: { width: 10 }, BorderLeft: -1, BorderRight: 1, BorderTop: -2, BorderBottom: 0 };
    const graphic = {
      MeasureList: [[{ PositionAndShape: ps, staffEntries: [] }]],
      MusicPages: [{ MusicSystems: [{ StaffLines: [{ AbstractExpressions: [{ sourceMultiExpression: { SourceMeasureParent: { measureListIndex: 0 }, Timestamp: { RealValue: 0.5 } }, label: { PositionAndShape: ps } }] }] }] }],
    };
    const { chords } = osmdGeometry(graphic, { measures: [{ length: 4 }], chords: [{ id: "c1", measure: 0, onset: 2 }] }, 1);
    expect(chords).toEqual([{ id: "c1", page: 0, x: 30, y: -10, w: 20, h: 20 }]);
  });
});

describe("measuresPerLine", () => {
  it("一般寬度固定 4 小節換行，手機 2 小節", async () => {
    const { measuresPerLine } = await import("./osmd-notes");
    expect(measuresPerLine(1200)).toBe(4);
    expect(measuresPerLine(600)).toBe(4);
    expect(measuresPerLine(375)).toBe(2);
    expect(measuresPerLine(0)).toBe(4);
  });
});

describe("chordLifts", () => {
  const R = (left, right, top, bottom) => ({ left, right, top, bottom });
  it("和弦字貼著下方音符就往上抬到至少 6px，離很遠或不在下方的不動", async () => {
    const { chordLifts } = await import("./osmd-notes");
    const text = R(100, 130, 80, 100);
    expect(chordLifts([text], [R(110, 120, 99, 110)])).toEqual([-7]);   // 壓到 1px → 抬 7
    expect(chordLifts([text], [R(110, 120, 103, 110)])).toEqual([-3]);  // 只隔 3px → 補到 6
    expect(chordLifts([text], [R(110, 120, 140, 150)])).toEqual([0]);   // 夠遠
    expect(chordLifts([text], [R(200, 210, 99, 110)])).toEqual([0]);    // 水平沒重疊
    expect(chordLifts([text], [R(110, 120, 40, 70)])).toEqual([0]);     // 在字上方（上一行的下譜）
    const rules = {};
    applyEngravingRules(rules, 900);
    expect(rules).toEqual({ RenderXMeasuresPerLineAkaSystem: 4 });
  });
  it("A4 分頁模式加寬頁邊、上方留曲名列空間", () => {
    const rules = {};
    applyEngravingRules(rules, 794, { paged: true });
    expect(rules).toMatchObject({ RenderXMeasuresPerLineAkaSystem: 4, PageTopMargin: 9, PageLeftMargin: 6, PageRightMargin: 6 });
  });
});
