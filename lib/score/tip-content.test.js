import { describe, it, expect } from "vitest";
import { noteTip, keyTip, chordTip, detectText, miniStaffSvg, miniJianpuSvg, midiToPitch } from "./tip-content.js";
import { recognizeChord } from "./chords.js";

const C = { fifths: 0 };
const G = { fifths: 1 };

describe("tip-content", () => {
  it("音符提示框：G4 · Sol · 5／右手 · 四分音符", () => {
    expect(noteTip({ staff: 1, dur: 1, pitch: { step: "G", alter: 0, octave: 4 } }, C)).toMatchObject({ title: "G4 · Sol · 5", sub: "右手 · 四分音符" });
    expect(noteTip({ staff: 2, dur: 2, pitch: { step: "G", alter: 0, octave: 3 } }, G)).toMatchObject({ title: "G3 · Sol · 1", sub: "左手 · 二分音符" });
    expect(noteTip({ staff: 1, dur: 1, rest: true }, C).title).toBe("休止符");
  });

  it("鍵盤提示框：C4 · Do · 1、升記號寫（升）", () => {
    expect(keyTip(60).title).toBe("C4 · Do · 1");
    expect(keyTip(61).title).toBe("C♯4 · Do（升） · ♯1");
    expect(midiToPitch(70, { fifths: -1 })).toEqual({ step: "B", alter: -1, octave: 4 });
  });

  it("和弦提示框：原位從 C4 起、根音、簡譜數字與說明", () => {
    const t = chordTip({ name: "G", root: { step: "G", alter: 0 }, kind: "major" }, C);
    expect(t.tones).toEqual([67, 71, 74]);
    expect(t.root).toBe(67);
    expect(t.foot).toBe("原位：G4 B4 D5 · 簡譜 5 7 2");
    expect(t.title).toBe("G 大三和弦 · V");
  });

  it("和弦辨識面板：單音、大小三和弦加級數、組成音加簡譜與半音", () => {
    expect(detectText([60], null)).toMatchObject({ big: "C4", sub: "Do · 簡譜 1" });
    const am = [57, 60, 64];
    expect(detectText(am, recognizeChord(am))).toMatchObject({ big: "Am", sub: "小三和弦 · 原位 · C 大調 vi 級", tones: "A3 C4 E4　簡譜 6 1 3　半音 3＋4" });
    expect(detectText([60, 62], null).sub).toBe("再加一個音就能組成和弦");
  });

  it("迷你五線譜與迷你簡譜", () => {
    const s = miniStaffSvg({ step: "C", alter: 0, octave: 4 }, "T");
    expect(s).toContain("<ellipse");
    expect((s.match(/x1="42"/g) || []).length).toBe(1); // 中央 C 一條加線
    expect(miniStaffSvg({ step: "F", alter: 1, octave: 4 }, "T")).toContain("♯");
    const j = miniJianpuSvg({ step: "C", alter: 0, octave: 5 }, C);
    expect(j).toContain(">1</text>");
    expect((j.match(/<circle/g) || []).length).toBe(1);
  });
});
