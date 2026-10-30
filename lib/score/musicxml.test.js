import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseMusicXml, ScoreError, SUPPORT } from "./musicxml.js";

const fx = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const TWINKLE = fx("twinkle-grand.musicxml");
const STRESS = fx("stress.musicxml");
const errCode = (fn) => {
  try {
    fn();
  } catch (e) {
    return e instanceof ScoreError ? e.code : `not ScoreError: ${e.message}`;
  }
  return "no error";
};

describe("parseMusicXml", () => {
  const bee = parseMusicXml(TWINKLE);
  const st = parseMusicXml(STRESS);
  const at = (m, measure, staff) => m.notes.filter((n) => n.measure === measure && n.staff === staff);

  it("小蜜蜂雙手", () => {
    expect(bee.title).toBe("小蜜蜂");
    expect(bee.measures.length).toBe(8);
    expect(bee.tempo).toBe(96);
    expect(bee.hasChords).toBe(true);
    expect(bee.chords[0].name).toBe("C");
    expect(bee.chords[1].name).toBe("G7");
    expect(at(bee, 0, 1)[0]).toMatchObject({ midi: 67, onset: 0, dur: 1, rest: false });
    const lh = at(bee, 0, 2).filter((n) => n.onset === 0);
    expect(lh.map((n) => n.midi)).toEqual([48, 52, 55]);
    bee.notes.forEach((n, i) => expect(n.id).toBe(`n${i}`));
    for (let i = 1; i < bee.notes.length; i++) {
      const a = bee.notes[i - 1], b = bee.notes[i];
      const key = (n) => [n.measure, n.staff, n.onset, n.midi ?? -1];
      const ka = key(a), kb = key(b);
      const cmp = ka.findIndex((v, k) => v !== kb[k]);
      if (cmp >= 0) expect(ka[cmp]).toBeLessThan(kb[cmp]);
    }
  });

  it("弱起小節", () => {
    expect(st.measures[0]).toMatchObject({ implicit: true, number: "0", length: 1 });
    expect(st.measures[1].length).toBe(4);
    expect(st.measures[1].implicit).toBe(false);
  });

  it("調號與轉調", () => {
    expect(st.measures[1].key.fifths).toBe(1);
    expect(st.measures[1].key.tonic).toEqual({ step: "G", alter: 0 });
    expect(st.measures[9].key.fifths).toBe(-1);
    expect(st.measures[9].key.tonic).toEqual({ step: "F", alter: 0 });
    expect(st.measures[12].key.fifths).toBe(-1);
  });

  it("拍號", () => {
    expect(st.measures[5].time).toEqual({ beats: 3, beatType: 4 });
    expect(st.measures[5].length).toBe(3);
    expect(st.measures[7].time).toEqual({ beats: 6, beatType: 8 });
    expect(st.measures[7].length).toBe(3);
    expect(st.measures[8].length).toBe(4);
  });

  it("時值：十六分、附點", () => {
    expect(at(st, 2, 1)[0].dur).toBeCloseTo(0.25);
    const m3 = at(st, 3, 1);
    expect(m3[0]).toMatchObject({ dur: 0.75, dots: 1 });
    expect(at(st, 1, 1).find((n) => n.dots === 1).dur).toBe(1.5);
  });

  it("臨時升降與還原", () => {
    expect(at(st, 5, 1).map((n) => n.midi)).toEqual([71, 73, 74]); // B4 C♯5 D5
    expect(at(st, 6, 1).map((n) => n.midi)).toEqual([74, 72, 71]); // D5（連結）C♮5 B4
  });

  it("連結線", () => {
    const start = at(st, 5, 1).find((n) => n.tieStart);
    const stop = at(st, 6, 1).find((n) => n.tieStop);
    expect(start.midi).toBe(74);
    expect(stop.midi).toBe(74);
    expect(stop.onset).toBe(0);
    expect(st.notes.filter((n) => n.tieStart).length).toBe(1);
  });

  it("三連音", () => {
    const t = at(st, 10, 1).filter((n) => n.tuplet);
    expect(t.length).toBe(3);
    t.forEach((n) => {
      expect(n.dur).toBeCloseTo(1 / 3);
      expect(n.tuplet).toEqual({ actual: 3, normal: 2 });
    });
    expect(t[1].onset).toBeCloseTo(1 / 3);
  });

  it("休止與同時按", () => {
    expect(at(st, 4, 1).some((n) => n.rest && n.midi === null && n.pitch === null)).toBe(true);
    expect(at(st, 2, 1).filter((n) => n.onset === 2).map((n) => n.midi)).toEqual([67, 71]);
    expect(at(st, 1, 2).filter((n) => n.onset === 0).length).toBe(3);
  });

  it("和弦名", () => {
    const names = st.chords.map((c) => c.name);
    expect(names).toEqual(["G", "D7", "Em", "Cmaj7", "C/E", "D7", "G", "Bdim", "Em", "D7", "G", "F", "Bb", "Dm", "F", "F"]);
    const ce = st.chords.find((c) => c.name === "C/E");
    expect(ce.root).toEqual({ step: "C", alter: 0 });
    expect(ce.bass).toEqual({ step: "E", alter: 0 });
    expect(st.chords.find((c) => c.name === "D7")).toMatchObject({ measure: 1, onset: 3, kind: "dominant" });
    expect(st.chords.find((c) => c.name === "Bb")).toMatchObject({ measure: 9, onset: 2, root: { step: "B", alter: -1 } });
    st.chords.forEach((c, i) => expect(c.id).toBe(`c${i}`));
  });

  it("反覆與結尾", () => {
    expect(st.measures[2].repeatStart).toBe(true);
    expect(st.measures[3].repeatEnd).toBe(true);
    expect(st.measures[3].repeatTimes).toBe(2);
    expect(st.measures[3].ending.numbers).toEqual([1]);
    expect(st.measures[4].ending.numbers).toEqual([2]);
    expect(st.measures[5].ending).toBe(null);
    expect(st.measures[1].repeatStart).toBe(false);
  });

  it("警告", () => {
    const ignored = st.warnings.filter((w) => w.code === "ignored_element").map((w) => w.message).join("\n");
    expect(ignored).toMatch("踏板");
    expect(ignored).toMatch("表情記號");
    expect(ignored).toMatch("裝飾音");
    const mv = st.warnings.find((w) => w.code === "multi_voice");
    expect(mv.measure).toBe(11);
    expect(bee.warnings.length).toBe(0);
  });

  it("裝飾音不進模型", () => {
    expect(at(st, 8, 1).length).toBe(1);
  });

  it("沒有和弦", () => {
    const m = parseMusicXml(TWINKLE.replace(/<harmony[\s\S]*?<\/harmony>\s*/g, ""));
    expect(m.hasChords).toBe(false);
    expect(m.chords.length).toBe(0);
    expect(m.notes.length).toBe(bee.notes.length);
  });

  it("擋下", () => {
    expect(errCode(() => parseMusicXml(TWINKLE.replace("<staves>2</staves>", "<staves>3</staves>")))).toBe("not_grand_staff");
    expect(errCode(() => parseMusicXml(fx("not-musicxml.xml")))).toBe("not_musicxml");
    expect(errCode(() => parseMusicXml(""))).toBe("empty");
    expect(errCode(() => parseMusicXml("   "))).toBe("empty");
    expect(errCode(() => parseMusicXml("<score-partwise><part"))).toBe("not_musicxml");
    expect(errCode(() => parseMusicXml('<score-timewise version="4.0"/>'))).toBe("not_musicxml");
    expect(errCode(() => parseMusicXml('<score-partwise version="4.0"><part-list/></score-partwise>'))).toBe("no_part");
  });

  it("只有右手一行也收：hasLeftHand=false、警告會說明左手自動產生", () => {
    const mel = parseMusicXml(fx("twinkle-melody.musicxml"));
    expect(mel.hasLeftHand).toBe(false);
    expect(mel.hasChords).toBe(true);
    expect(mel.notes.every((n) => n.staff === 1)).toBe(true);
    expect(mel.notes.length).toBe(bee.notes.filter((n) => n.staff === 1).length);
    expect(mel.warnings.find((w) => w.code === "right_hand_only").message).toMatch("自動");
    const plain = parseMusicXml(fx("single-staff.musicxml"));
    expect(plain.hasLeftHand).toBe(false);
    expect(plain.warnings.find((w) => w.code === "right_hand_only").message).toMatch("沒有和弦");
    expect(bee.hasLeftHand).toBe(true);
  });

  it("多 part 只取第一個", () => {
    const two = TWINKLE.replace("</part-list>", '<score-part id="P2"><part-name>Bass</part-name></score-part></part-list>')
      .replace("</score-partwise>", '<part id="P2"><measure number="1"><note><rest/><duration>8</duration></note></measure></part></score-partwise>');
    const m = parseMusicXml(two);
    expect(m.notes.length).toBe(bee.notes.length);
    expect(m.warnings.map((w) => w.code)).toContain("multi_part");
  });

  it("N.C.、延伸音與 kind 的 text：和弦名照打譜軟體", () => {
    const h = (inner) => `<harmony><root><root-step>C</root-step></root>${inner}</harmony>`;
    const xml = TWINKLE.replace(/<harmony[\s\S]*?<\/harmony>/, h('<kind text="N.C.">none</kind>'))
      .replace(/(<measure number="2">\s*)<harmony[\s\S]*?<\/harmony>/, `$1${h("<kind>major</kind><degree><degree-value>9</degree-value><degree-alter>0</degree-alter><degree-type>add</degree-type></degree>")}`)
      .replace(/(<measure number="3">\s*)<harmony[\s\S]*?<\/harmony>/, `$1${h('<kind text="7sus4">suspended-fourth</kind><degree><degree-value>7</degree-value><degree-alter>-1</degree-alter><degree-type>add</degree-type></degree>')}`)
      .replace(/(<measure number="4">\s*)<harmony[\s\S]*?<\/harmony>/, `$1${h("<kind>dominant</kind><degree><degree-value>9</degree-value><degree-alter>-1</degree-alter><degree-type>add</degree-type></degree>")}`);
    const m = parseMusicXml(xml);
    expect(m.chords.slice(0, 4).map((c) => c.name)).toEqual(["N.C.", "Cadd9", "C7sus4", "C7(b9)"]);
    expect(m.chords[1].degrees).toEqual([{ value: 9, alter: 0, type: "add" }]);
  });

  it("SUPPORT 清單", () => {
    const els = SUPPORT.ignored.map((x) => x.element);
    for (const e of ["pedal", "dynamics", "wedge", "ornaments", "grace", "fermata", "lyric", "segno"]) expect(els).toContain(e);
    for (const x of [...SUPPORT.supported, ...SUPPORT.ignored]) expect(x.label).toMatch(/\S/);
  });
});
