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
    const rh = parseMusicXml(xml);
    expect(rh.hasLeftHand).toBe(false);
    expect(rh.notes.some((n) => n.staff === 2)).toBe(false);
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

describe("prepareStaffXml 自動補連桿（原檔沒寫 <beam> 時）", () => {
  // 回傳某小節某 staff 各音符（不含和弦音、裝飾音）的 beam 標記，例如 ["1:begin", "1:end"]
  const beamsOf = (xml, measureNumber, staff = "1", voice = null) => {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const ms = doc.getElementsByTagName("measure");
    const m = Array.from({ length: ms.length }, (_, i) => ms[i]).find((x) => x.getAttribute("number") === String(measureNumber));
    const notes = Array.from(m.getElementsByTagName("note")).filter((n) =>
      !n.getElementsByTagName("chord").length && !n.getElementsByTagName("grace").length &&
      (n.getElementsByTagName("staff")[0]?.textContent || "1") === staff &&
      (!voice || n.getElementsByTagName("voice")[0]?.textContent === voice));
    return notes.map((n) => Array.from(n.getElementsByTagName("beam")).map((b) => `${b.getAttribute("number")}:${b.textContent}`).join(",") || "-");
  };
  const BEE_OUT = prepareStaffXml(BEE, bee, O);
  const ST_OUT = prepareStaffXml(STRESS, st, O);

  it("4/4 八分音符每拍兩個連一組；四分音符不連", () => {
    expect(beamsOf(BEE_OUT, 1)).toEqual(["-", "1:begin", "1:end", "-", "1:begin", "1:end"]);
    expect(beamsOf(BEE_OUT, 2)).toEqual(["1:begin", "1:end", "1:begin", "1:end", "-", "-"]);
  });

  it("6/8 三個八分音符連成一組", () => {
    expect(beamsOf(ST_OUT, 7)).toEqual(["1:begin", "1:continue", "1:end", "-"]);
  });

  it("十六分音符兩條連桿；附點八分＋十六分用一條連桿加短鉤", () => {
    expect(beamsOf(ST_OUT, 2).slice(0, 4)).toEqual([
      "1:begin,2:begin", "1:continue,2:continue", "1:continue,2:continue", "1:end,2:end",
    ]);
    expect(beamsOf(ST_OUT, 3).slice(0, 2)).toEqual(["1:begin", "1:end,2:backward hook"]);
  });

  it("單獨一個八分音符（後面接四分）不連；三連音連成一組", () => {
    expect(beamsOf(ST_OUT, 1)).toEqual(["1:begin", "1:end", "-", "-", "-"]);
    expect(beamsOf(ST_OUT, 10).slice(0, 3)).toEqual(["1:begin", "1:continue", "1:end"]);
  });

  it("原檔有寫 <beam> 就照原檔，不另外補", () => {
    const withBeam = BEE.replace("<type>eighth</type>", '<type>eighth</type><beam number="1">begin</beam>');
    const out = prepareStaffXml(withBeam, parseMusicXml(withBeam), O);
    expect((out.match(/<beam /g) || []).length).toBe(1);
  });

  it("補連桿不影響音符", () => {
    expect(parseMusicXml(ST_OUT.replace(/<words>[^<]*<\/words>/g, "")).notes.length).toBe(st.notes.length);
  });
});

describe("prepareStaffXml 連桿：只補原本沒寫連桿的那一行", () => {
  it("右手原檔有連桿、自動產生的左手八分音符仍會補", async () => {
    const { withAccompaniment, accompanimentXml } = await import("./accompaniment.js");
    const withBeam = BEE.replace("<type>eighth</type>", '<type>eighth</type><beam number="1">begin</beam>');
    const m = withAccompaniment(parseMusicXml(withBeam), "arp");
    const out = prepareStaffXml(accompanimentXml(withBeam, m), m, O);
    const doc = new DOMParser().parseFromString(out, "text/xml");
    const notes = Array.from(doc.getElementsByTagName("note"));
    const lhBeams = notes.filter((n) => n.getElementsByTagName("staff")[0]?.textContent === "2" && n.getElementsByTagName("beam").length);
    const rhBeams = notes.filter((n) => n.getElementsByTagName("staff")[0]?.textContent === "1" && n.getElementsByTagName("beam").length);
    expect(lhBeams.length).toBeGreaterThan(0);
    expect(rhBeams.length).toBe(1); // 右手照原檔，不另外補
  });
});
