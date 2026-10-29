import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { DOMParser } from "@xmldom/xmldom";
import { parseMusicXml, ScoreError } from "./musicxml.js";
import { prepareStaffXml, matchStaffNotes } from "./staff-xml.js";

const fx = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const BEE = fx("twinkle-grand.musicxml");
const STRESS = fx("stress.musicxml");
const bee = parseMusicXml(BEE);
const st = parseMusicXml(STRESS);
const O = { rightHandOnly: false, chordMode: "name", showChords: true };
const words = (xml) => {
  const w = new DOMParser().parseFromString(xml, "text/xml").getElementsByTagName("words");
  return Array.from({ length: w.length }, (_, i) => w[i].textContent);
};

describe("prepareStaffXml", () => {
  it("和弦換成文字，音符不變", () => {
    const xml = prepareStaffXml(BEE, bee, O);
    const m = parseMusicXml(xml);
    expect(m.notes.length).toBe(bee.notes.length);
    expect(m.hasChords).toBe(false);
    expect(words(xml)).toEqual(["C", "G7", "C", "C", "G7", "C", "G7", "C"]);
  });

  it("級數與兩者", () => {
    expect(words(prepareStaffXml(BEE, bee, { ...O, chordMode: "roman" }))[1]).toBe("V7");
    expect(words(prepareStaffXml(BEE, bee, { ...O, chordMode: "both" }))[0]).toBe("C (I)");
  });

  it("關掉和弦：不留和弦也不加文字", () => {
    const xml = prepareStaffXml(BEE, bee, { ...O, showChords: false });
    expect(words(xml)).toEqual([]);
    expect(xml).not.toContain("<harmony");
  });

  it("和弦的 offset 保留在文字上", () => {
    const xml = prepareStaffXml(STRESS, st, O);
    expect(xml).toMatch(/<words>Bb<\/words><\/direction-type><offset>24<\/offset>/);
  });

  it("只看右手：刪掉左手", () => {
    const xml = prepareStaffXml(BEE, bee, { ...O, rightHandOnly: true });
    expect(() => parseMusicXml(xml)).toThrow(ScoreError);
    try {
      parseMusicXml(xml);
    } catch (e) {
      expect(e.code).toBe("not_grand_staff");
    }
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const staffs = doc.getElementsByTagName("staff");
    for (let i = 0; i < staffs.length; i++) expect(staffs[i].textContent.trim()).not.toBe("2");
    expect(doc.getElementsByTagName("staves")[0].textContent).toBe("1");
    const notes = doc.getElementsByTagName("note");
    expect(notes.length).toBe(bee.notes.filter((n) => n.staff === 1).length);
  });

  it("只看右手時壓力檔仍保留右手兩個聲部、踏板（左手記號）被刪", () => {
    const xml = prepareStaffXml(STRESS, st, { ...O, rightHandOnly: true });
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    expect(doc.getElementsByTagName("pedal").length).toBe(0); // 檔頭註解也寫了 <pedal>，所以查元素
    expect(doc.getElementsByTagName("note").length).toBe(st.notes.filter((n) => n.staff === 1).length + 1); // +1 裝飾音
  });
});

describe("matchStaffNotes", () => {
  const fake = (m) => m.notes.map((n) => ({ measure: n.measure, staff: n.staff, onset: n.onset, midi: n.midi, el: { id: n.id } }));

  it("全部配對", () => {
    const map = matchStaffNotes(st, fake(st));
    expect(map.unmatched).toBe(0);
    for (const n of st.notes) expect(map.get(n.id)?.[0]).toEqual({ id: n.id });
  });

  it("onset 誤差 0.001 拍仍配對、0.1 拍配不到", () => {
    const r = fake(bee);
    r[0] = { ...r[0], onset: r[0].onset + 0.001 };
    expect(matchStaffNotes(bee, r).unmatched).toBe(0);
    r[0] = { ...r[0], onset: r[0].onset + 0.1 };
    const map = matchStaffNotes(bee, r);
    expect(map.unmatched).toBe(1);
    expect(map.has("n0")).toBe(false);
  });
});
