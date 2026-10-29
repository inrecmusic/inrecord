import { describe, it, expect } from "vitest";
import { collectOsmdNotes, OSMD_HALFTONE_TO_MIDI, OSMD_OPTIONS } from "./osmd-notes.js";

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
