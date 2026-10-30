import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseMusicXml } from "./musicxml.js";
import { chordBars, chordText, applyChordText } from "./chord-edit.js";

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");
const MEL = fx("twinkle-melody.musicxml");
const BEE = fx("twinkle-grand.musicxml");
const STRESS = fx("stress.musicxml");
const mel = parseMusicXml(MEL);
const bee = parseMusicXml(BEE);
const st = parseMusicXml(STRESS);
const key = (n) => `${n.measure}|${n.staff}|${n.onset}|${n.dur}|${n.midi}`;
const names = (m, measure) => m.chords.filter((c) => c.measure === measure).map((c) => [c.onset, c.name]);

describe("chordText", () => {
  it("每小節一段、用 | 分開，和弦名照文字框寫法", () => {
    const bars = chordBars(mel);
    expect(bars.length).toBe(mel.measures.length);
    expect(chordText(mel)).toBe(bars.join(" | "));
    expect(bars[0]).toBe(mel.chords.filter((c) => c.measure === 0).map((c) => c.name).join(" "));
  });
});

describe("applyChordText", () => {
  it("沒改就原樣回傳", () => expect(applyChordText(MEL, mel, chordText(mel))).toBe(MEL));

  it("改一小節：只換那小節的和弦，音符一個都不動", () => {
    const bars = chordBars(mel);
    bars[1] = "Am F";
    const out = parseMusicXml(applyChordText(MEL, mel, bars.join(" | ")));
    expect(out.notes.map(key)).toEqual(mel.notes.map(key));
    expect(names(out, 1)).toEqual([[0, "Am"], [mel.measures[1].length / 2, "F"]]);
    for (let i = 0; i < mel.measures.length; i++) if (i !== 1) expect(names(out, i)).toEqual(names(mel, i));
  });

  it("雙手譜：和弦放在右手、左手不受影響", () => {
    const bars = chordBars(bee);
    bars[0] = "G7/B";
    const out = parseMusicXml(applyChordText(BEE, bee, bars.join(" | ")));
    expect(out.notes.map(key)).toEqual(bee.notes.map(key));
    expect(names(out, 0)).toEqual([[0, "G7/B"]]);
  });

  it("清空一小節＝沿用前一個（那小節不寫和弦）；N.C. 可以打", () => {
    const bars = chordBars(mel);
    bars[1] = "";
    bars[2] = "N.C.";
    const out = parseMusicXml(applyChordText(MEL, mel, bars.join(" | ")));
    expect(names(out, 1)).toEqual([]);
    expect(names(out, 2)).toEqual([[0, "N.C."]]);
  });

  it("壓力檔（弱起、轉調、多聲部）：改每一小節後音符不變、和弦落在平均拍位", () => {
    const text = st.measures.map(() => "C G").join(" | ");
    const out = parseMusicXml(applyChordText(STRESS, st, text));
    expect(out.notes.map(key)).toEqual(st.notes.map(key));
    st.measures.forEach((m, i) => expect(names(out, i).map(([o]) => o)).toEqual([0, m.length / 2]));
  });

  it("寫錯指出第幾小節；小節數太多也擋", () => {
    const bars = chordBars(mel);
    bars[3] = "Hm";
    expect(() => applyChordText(MEL, mel, bars.join(" | "))).toThrow("第 4 小節");
    expect(() => applyChordText(MEL, mel, [...chordBars(mel), "C"].join(" | "))).toThrow("比樂譜的");
  });
});
