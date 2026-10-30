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
  it("柱式＋第 8 章單元（8-2～8-8）", () =>
    expect(ACCOMPANIMENTS.map((a) => a.label)).toEqual([
      "柱式", "8-2 根音伴奏", "8-3 經典波浪", "8-4 交錯律動", "8-5 折返分解", "8-6 五度伴奏", "8-7 五八度伴奏", "8-8 先八度後五度",
    ]));
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

describe("patternEvents（第 8 章伴奏型態）", () => {
  const C = voicing(ch("C"));
  it("柱式：一整段一個和弦", () => expect(patternEvents("block", C, 4)).toEqual([[0, 4, [48, 52, 55]]]));
  const notes = (style, L = 4) => patternEvents(style, C, L).map((e) => e[2][0]);
  it("8-2 根音伴奏：整段一個根音長音", () => expect(patternEvents("root", C, 4)).toEqual([[0, 4, [48]]]));
  it("8-6 五度伴奏：根音＋五度一起按", () => expect(patternEvents("power", C, 4)).toEqual([[0, 4, [48, 55]]]));
  it("8-3 經典波浪 1-3-5-3", () => expect(notes("wave")).toEqual([48, 52, 55, 52]));
  it("8-4 交錯律動 1-5-3-5", () => expect(notes("rocking")).toEqual([48, 55, 52, 55]));
  it("8-5 折返分解 1-5-3-1", () => expect(notes("arch")).toEqual([48, 55, 52, 48]));
  it("8-7 五八度 1-5-8，4/4 循環回到 1", () => expect(notes("r158")).toEqual([48, 55, 60, 48]));
  it("8-8 先八度後五度 1-8-5", () => expect(notes("r185")).toEqual([48, 60, 55, 48]));
  it("分解類每拍一個四分音符", () => expect(patternEvents("wave", C, 4).every(([, d]) => d === 1)).toBe(true));
  it("拍數較短就截斷；3/4 只有三個音、2 拍只有兩個", () => {
    expect(patternEvents("rocking", C, 3).length).toBe(3);
    expect(patternEvents("r158", C, 2).length).toBe(2);
  });
  it("slash 和弦：1 是指定低音，三音／五音不低於它", () => {
    const CE = voicing(ch("C", "major", "E"));
    expect(patternEvents("wave", CE, 4).map((e) => e[2][0])).toEqual([40, 52, 55, 52]);
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
    const m = withAccompaniment(bee, "wave");
    expect(lh(m, 0).length).toBe(4);
    expect(lh(m, 0).every((n) => n.dur === 1)).toBe(true);
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
    const m = withAccompaniment(mel, "r158");
    same(accompanimentXml(MEL_XML, m), m);
  });
  it("雙手檔換掉原本左手", () => {
    const m = withAccompaniment(bee, "rocking");
    same(accompanimentXml(BEE_XML, m), m);
  });
  it("壓力檔（轉調、變拍、弱起、多聲部）也一致", () => {
    for (const style of ["block", "root", "wave", "rocking", "arch", "power", "r158", "r185"]) {
      const m = withAccompaniment(st, style);
      const back = parseMusicXml(accompanimentXml(fx("stress.musicxml"), m));
      expect(back.notes.filter((n) => n.staff === 2).map((n) => `${n.measure}|${n.onset}|${n.midi}`)).toEqual(
        m.notes.filter((n) => n.staff === 2).map((n) => `${n.measure}|${n.onset}|${n.midi}`),
      );
    }
  });
});
