import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseMusicXml } from "./musicxml.js";
import { ACCOMPANIMENTS, chordSegments, voicing, patternEvents, withAccompaniment, accompanimentXml } from "./accompaniment.js";

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");
const MEL_XML = fx("twinkle-melody.musicxml");
const BEE_XML = fx("twinkle-grand.musicxml");
const mel = parseMusicXml(MEL_XML);
const bee = parseMusicXml(BEE_XML);
const st = parseMusicXml(fx("stress.musicxml"));
const sp = (s) => ({ step: s[0], alter: s[1] === "#" ? 1 : s[1] === "b" ? -1 : 0 });
const ch = (root, kind = "major", bass = null) => ({ root: sp(root), kind, bass: bass ? sp(bass) : null, name: root });
const lh = (m, measure) => m.notes.filter((n) => n.staff === 2 && (measure === undefined || n.measure === measure));

describe("ACCOMPANIMENTS", () => {
  it("照原型的四種", () => expect(ACCOMPANIMENTS.map((a) => a.label)).toEqual(["柱式", "根音＋和弦", "分解", "琶音"]));
});

describe("voicing（原型 makeChord／lhRoot）", () => {
  it("根音落在 F2–E3：C → C3、G7 → G2", () => {
    expect(voicing(ch("C"))).toMatchObject({ r: 48, low: 48, t: 52, f: 55, tones: [48, 52, 55], slash: false });
    expect(voicing(ch("G", "dominant"))).toMatchObject({ r: 43, tones: [43, 47, 50, 53] });
  });
  it("slash 和弦：低音放在根音下面", () => {
    expect(voicing(ch("C", "major", "E"))).toMatchObject({ low: 40, slash: true, tones: [48, 52, 55] });
  });
});

describe("patternEvents（原型 PATTERNS）", () => {
  const C = voicing(ch("C"));
  it("柱式：一整段一個和弦", () => expect(patternEvents("block", C, 4)).toEqual([[0, 4, [48, 52, 55]]]));
  it("根音＋和弦：低音、和弦、五度、和弦", () =>
    expect(patternEvents("bass", C, 4)).toEqual([[0, 1, [36]], [1, 1, [48, 52, 55]], [2, 1, [43]], [3, 1, [48, 52, 55]]]));
  it("根音＋和弦不到兩拍：低音和和弦一起按", () => expect(patternEvents("bass", C, 1)).toEqual([[0, 1, [36, 48, 52, 55]]]));
  it("分解：低音－五度－三度－五度", () =>
    expect(patternEvents("broken", C, 4)).toEqual([[0, 1, [48]], [1, 1, [55]], [2, 1, [52]], [3, 1, [55]]]));
  it("琶音：八分音符上下行", () =>
    expect(patternEvents("arp", C, 4).map((e) => e[2][0])).toEqual([36, 43, 48, 52, 55, 52, 48, 43]));
  it("拍數較短就截斷；3/4 的分解只有三個音", () => {
    expect(patternEvents("broken", C, 3).length).toBe(3);
    expect(patternEvents("arp", C, 2).length).toBe(4);
  });
  it("slash 和弦的柱式把低音放最下", () =>
    expect(patternEvents("block", voicing(ch("C", "major", "E")), 4)).toEqual([[0, 4, [40, 48, 52, 55]]]));
});

describe("chordSegments", () => {
  it("和弦在小節中間換就切開", () => {
    const s = chordSegments(st).filter((x) => x.measure === 1);
    expect(s.map((x) => [x.start, x.len, x.chord.name])).toEqual([[0, 3, "G"], [3, 1, "D7"]]);
  });
  it("弱起小節前面沒有和弦就不配", () => expect(chordSegments(st).some((x) => x.measure === 0)).toBe(false));
  it("小節開頭沒寫和弦就沿用上一個", () => {
    const m = {
      measures: [0, 1].map((i) => ({ index: i, length: 4, implicit: false, time: { beats: 4, beatType: 4 }, key: { fifths: 0 } })),
      chords: [{ id: "c0", measure: 0, onset: 0, ...ch("C") }],
    };
    expect(chordSegments(m).map((x) => [x.measure, x.start, x.len])).toEqual([[0, 0, 4], [1, 0, 4]]);
  });
});

describe("withAccompaniment", () => {
  it("只有右手的曲子：柱式每小節一個和弦、id 重新連號", () => {
    const m = withAccompaniment(mel, "block");
    expect(m.hasLeftHand).toBe(true);
    expect(m.accompaniment).toBe("block");
    expect(lh(m).length).toBe(5 * 3 + 3 * 4); // C 三個音 ×5 小節、G7 四個音 ×3 小節
    expect(lh(m, 0).map((n) => n.midi)).toEqual([48, 52, 55]);
    expect(lh(m, 1).map((n) => n.midi)).toEqual([43, 47, 50, 53]);
    expect(m.notes.filter((n) => n.staff === 1).length).toBe(mel.notes.length);
    m.notes.forEach((n, i) => expect(n.id).toBe(`n${i}`));
  });
  it("原譜有左手時換成產生的伴奏；original 不動", () => {
    expect(withAccompaniment(bee, "original")).toBe(bee);
    const m = withAccompaniment(bee, "arp");
    expect(lh(m, 0).length).toBe(8);
    expect(lh(m, 0).every((n) => n.dur === 0.5)).toBe(true);
  });
  it("音名依調號拼：F 大調的 B♭", () => {
    const m = withAccompaniment(st, "block");
    const bb = lh(m, 9).find((n) => n.midi % 12 === 10);
    expect(bb.pitch).toMatchObject({ step: "B", alter: -1 });
  });
  it("不是標準時值就拆成連結線", () => {
    const one = {
      ...mel,
      measures: [{ ...mel.measures[0], length: 4 }],
      notes: [],
      chords: [{ id: "c0", measure: 0, onset: 0, ...ch("C") }, { id: "c1", measure: 0, onset: 2.5, ...ch("F") }],
    };
    const m = withAccompaniment(one, "block");
    const c = lh(m).filter((n) => n.midi === 48 && n.onset < 2.5); // F 和弦也有 C3，只看 C 和弦那段
    expect(c.map((n) => [n.onset, n.dur, n.tieStart, n.tieStop])).toEqual([[0, 2, true, false], [2, 0.5, false, true]]);
  });
  it("沒有和弦：不產生左手", () => {
    const plain = parseMusicXml(fx("single-staff.musicxml"));
    expect(withAccompaniment(plain, "block").notes.some((n) => n.staff === 2)).toBe(false);
  });
});

describe("accompanimentXml", () => {
  const same = (xml, model) => {
    const back = parseMusicXml(xml);
    expect(back.hasLeftHand).toBe(true);
    const key = (n) => `${n.measure}|${n.staff}|${n.onset}|${n.dur}|${n.midi}`;
    expect(back.notes.map(key)).toEqual(model.notes.map(key));
  };
  it("只有右手的檔加上大譜表第二行，解析回來跟模型一模一樣", () => {
    const m = withAccompaniment(mel, "arp");
    same(accompanimentXml(MEL_XML, m), m);
  });
  it("雙手檔換掉原本左手", () => {
    const m = withAccompaniment(bee, "bass");
    same(accompanimentXml(BEE_XML, m), m);
  });
  it("壓力檔（轉調、變拍、弱起、多聲部）也一致", () => {
    for (const style of ["block", "bass", "broken", "arp"]) {
      const m = withAccompaniment(st, style);
      const back = parseMusicXml(accompanimentXml(fx("stress.musicxml"), m));
      expect(back.notes.filter((n) => n.staff === 2).map((n) => `${n.measure}|${n.onset}|${n.midi}`)).toEqual(
        m.notes.filter((n) => n.staff === 2).map((n) => `${n.measure}|${n.onset}|${n.midi}`),
      );
    }
  });
});
