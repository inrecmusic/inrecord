import { describe, it, expect } from "vitest";
import { parseAbc } from "./abc.js";
import { buildTimeline, midiToFreq, noteAt, measureStarts, DEFAULT_TEMPO } from "./playback.js";

const head = "X:1\nM:2/4\nL:1/8\nQ:1/4=120\nK:C\n";

describe("buildTimeline", () => {
  it("四分音符 = 120 → 每拍 0.5 秒", () => {
    const { events, duration, bpm } = buildTimeline(parseAbc(head + "G2 E E |"));
    expect(bpm).toBe(120);
    expect(events.map((e) => [e.index, e.midi, +e.at.toFixed(3), +e.dur.toFixed(3)])).toEqual([
      [0, 67, 0, 0.5], [1, 64, 0.5, 0.25], [2, 64, 0.75, 0.25],
    ]);
    expect(duration).toBeCloseTo(1);
  });
  it("休止不出聲但佔時間", () => {
    const { events, duration } = buildTimeline(parseAbc(head + "C z C |"));
    expect(events.length).toBe(2);
    expect(events[1].at).toBeCloseTo(0.5);
    expect(duration).toBeCloseTo(0.75);
  });
  it("連音線合併成一個聲音、時值相加", () => {
    const { events } = buildTimeline(parseAbc(head + "C2- C2 |"));
    expect(events.length).toBe(1);
    expect(events[0].dur).toBeCloseTo(1);
  });
  it("速度倍率：0.5 倍速時間加倍", () => {
    expect(buildTimeline(parseAbc(head + "C2 |"), { rate: 0.5 }).duration).toBeCloseTo(1);
  });
  it("沒寫 Q: 用預設速度，且速度會被夾在合理範圍", () => {
    expect(buildTimeline(parseAbc("X:1\nM:2/4\nL:1/8\nK:C\nC |")).bpm).toBe(DEFAULT_TEMPO);
    expect(buildTimeline(parseAbc(head + "C |"), { tempo: 9999 }).bpm).toBe(240);
  });
  it("空模型 → 沒有事件", () => expect(buildTimeline(null)).toMatchObject({ events: [], duration: 0 }));
});

describe("midiToFreq", () => {
  it("A4=440、中央 C≈261.6", () => {
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(midiToFreq(60)).toBeCloseTo(261.63, 1);
  });
});

describe("noteAt（播放高亮）", () => {
  const { events } = buildTimeline(parseAbc(head + "G2 E E |"));
  it("依時間找出目前音符", () => {
    expect(noteAt(events, 0)).toBe(0);
    expect(noteAt(events, 0.6)).toBe(1);
    expect(noteAt(events, 0.9)).toBe(2);
  });
  it("開始前回 -1", () => expect(noteAt(events, -1)).toBe(-1));
});

describe("measureStarts（循環練習段）", () => {
  it("每小節的起點時間", () => {
    const starts = measureStarts(parseAbc(head + "G2 E E | F2 D D | C4 |"));
    expect(starts.map((s) => +s.toFixed(2))).toEqual([0, 1, 2]);
  });
});
