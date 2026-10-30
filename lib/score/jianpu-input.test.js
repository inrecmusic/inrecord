import { describe, it, expect } from "vitest";
import { jianpuToMusicXml } from "./jianpu-input.js";
import { parseMusicXml, ScoreError } from "./musicxml.js";

const BEE = {
  title: "小蜜蜂", key: "C", beats: 4, beatType: 4, tempo: 96,
  melody: "5 3 3 - | 4 2 2 - | 1 2 3 4 | 5 5 5 - | 5 3 3 - | 4 2 2 - | 1 3 5 5 | 3 - - - | 2 2 2 2 | 2 3 4 - | 3 3 3 3 | 3 4 5 - | 5 3 3 - | 4 2 2 - | 1 3 5 5 | 1 - - -",
  chords: "C | G | C | G | C | G | C | C | G | G | C | C | C | G | C G | C",
};
const err = (input) => {
  try {
    jianpuToMusicXml(input);
  } catch (e) {
    return e instanceof ScoreError ? e.message : `other: ${e.message}`;
  }
  return "no error";
};

describe("jianpuToMusicXml（後台直接打簡譜）", () => {
  const m = parseMusicXml(jianpuToMusicXml(BEE));

  it("原型的小蜜蜂：16 小節、只有右手、和弦照小節分", () => {
    expect(m.title).toBe("小蜜蜂");
    expect(m.measures.length).toBe(16);
    expect(m.tempo).toBe(96);
    expect(m.hasLeftHand).toBe(false);
    expect(m.chords.length).toBe(17);
    expect(m.chords.filter((c) => c.measure === 14).map((c) => [c.onset, c.name])).toEqual([[0, "C"], [2, "G"]]);
    expect(m.notes[0]).toMatchObject({ midi: 67, onset: 0, dur: 1 });
    expect(m.notes.find((n) => n.measure === 0 && n.onset === 2)).toMatchObject({ midi: 64, dur: 2 }); // 3 -
    expect(m.notes.find((n) => n.measure === 7)).toMatchObject({ midi: 64, dur: 4 }); // 3 - - -
  });

  it("時值與八度：_ 八分、__ 十六分、. 附點、' 高八度", () => {
    const x = parseMusicXml(jianpuToMusicXml({ ...BEE, melody: "_1 _2 3. _4 __5 __6 _7'", chords: "" }));
    expect(x.notes.map((n) => [n.onset, n.dur, n.midi])).toEqual([
      [0, 0.5, 60], [0.5, 0.5, 62], [1, 1.5, 64], [2.5, 0.5, 65], [3, 0.25, 67], [3.25, 0.25, 69], [3.5, 0.5, 83],
    ]);
    expect(x.hasChords).toBe(false);
  });

  it("升降與休止", () => {
    const x = parseMusicXml(jianpuToMusicXml({ ...BEE, melody: "0 #4 b7 - ", chords: "" }));
    expect(x.notes.map((n) => [n.rest, n.midi])).toEqual([[true, null], [false, 66], [false, 70]]);
    expect(x.notes.find((n) => n.midi === 70).pitch).toMatchObject({ step: "B", alter: -1 });
  });

  it("調號：1=G 時 1 是 G4、低音 7 是 F♯4", () => {
    const x = parseMusicXml(jianpuToMusicXml({ ...BEE, key: "G", melody: "1 7, 1 -", chords: "G" }));
    expect(x.notes.map((n) => n.midi)).toEqual([67, 66, 67]);
    expect(x.notes[1].pitch).toMatchObject({ step: "F", alter: 1 });
    expect(x.measures[0].key.fifths).toBe(1);
  });

  it("3/4 拍、第一小節較短當弱起", () => {
    const x = parseMusicXml(jianpuToMusicXml({ ...BEE, beats: 3, beatType: 4, melody: "5 | 1 - 3 | 5 - -", chords: "| C | G" }));
    expect(x.measures[0]).toMatchObject({ implicit: true, length: 1 });
    expect(x.measures[1].time).toEqual({ beats: 3, beatType: 4 });
    expect(x.chords.map((c) => [c.measure, c.name])).toEqual([[1, "C"], [2, "G"]]);
  });

  it("各種和弦寫法", () => {
    const x = parseMusicXml(jianpuToMusicXml({ ...BEE, melody: "1 - - - | 1 - - - | 1 - - -", chords: "Cmaj7 Am7 | F#m Bb | Dsus4 G7/B" }));
    expect(x.chords.map((c) => c.name)).toEqual(["Cmaj7", "Am7", "F#m", "Bb", "Dsus4", "G7/B"]);
  });

  it("錯誤訊息指出第幾小節、白話", () => {
    expect(err({ ...BEE, melody: "5 3 3 - | 4 2 2" })).toMatch("第 2 小節有 3 拍");
    expect(err({ ...BEE, melody: "5 3 3 x" })).toMatch("看不懂「x」");
    expect(err({ ...BEE, melody: "- 3 3 3" })).toMatch("第 1 小節開頭不能是「-」");
    expect(err({ ...BEE, chords: "C | Hm" })).toMatch("看不懂和弦「Hm」");
    expect(err({ ...BEE, chords: "C D E" })).toMatch("第 1 小節有 3 個和弦");
    expect(err({ ...BEE, melody: "" })).toMatch("旋律是空的");
  });

  it("曲名跳脫", () => {
    expect(parseMusicXml(jianpuToMusicXml({ ...BEE, title: "<a&b>" })).title).toBe("<a&b>");
  });
});
