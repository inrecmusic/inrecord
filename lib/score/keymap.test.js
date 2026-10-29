import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { KEYMAP, durationLabel } from "./keymap.js";
import { chordAt } from "./chords.js";
import { parseMusicXml } from "./musicxml.js";

describe("KEYMAP（原型的電腦鍵盤對照）", () => {
  it("Z 起是 C3、Q 起是 C4、9 起是 C♯5", () => {
    expect(KEYMAP.z).toBe(48);
    expect(KEYMAP[","]).toBe(60);
    expect(KEYMAP.q).toBe(60);
    expect(KEYMAP.i).toBe(72);
    expect(KEYMAP["9"]).toBe(73);
    expect(KEYMAP.p).toBe(76);
  });
});

describe("durationLabel", () => {
  it("常見時值", () => {
    expect(durationLabel({ dur: 1, dots: 0 })).toBe("四分音符（1 拍）");
    expect(durationLabel({ dur: 1.5, dots: 1 })).toBe("附點四分音符（1.5 拍）");
    expect(durationLabel({ dur: 0.25, dots: 0 })).toBe("十六分音符（1/4 拍）");
    expect(durationLabel({ dur: 1 / 3, dots: 0, tuplet: { actual: 3, normal: 2 } })).toBe("三連音（1/3 拍）");
  });
});

describe("chordAt（這一拍的和弦）", () => {
  const st = parseMusicXml(readFileSync(new URL("./fixtures/stress.musicxml", import.meta.url), "utf8"));
  it("同小節取最近一個、跨小節沿用前一個", () => {
    expect(chordAt(st, 1, 0).name).toBe("G");
    expect(chordAt(st, 1, 2.5).name).toBe("G");
    expect(chordAt(st, 1, 3).name).toBe("D7");
    expect(chordAt(st, 0, 0)).toBe(null);
  });
});
