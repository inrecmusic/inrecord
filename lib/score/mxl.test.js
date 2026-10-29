import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";
import { extractMxl, readScoreFile } from "./mxl.js";
import { parseMusicXml, ScoreError } from "./musicxml.js";

const bytes = (name) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const STRESS_XML = readFileSync(new URL("./fixtures/stress.musicxml", import.meta.url), "utf8");
const code = (fn) => {
  try {
    fn();
  } catch (e) {
    return e instanceof ScoreError ? e.code : `other: ${e.message}`;
  }
  return "no error";
};

describe("extractMxl", () => {
  it("依 container.xml 取出主 XML", () => {
    const xml = extractMxl(bytes("stress.mxl"));
    expect(parseMusicXml(xml).notes.length).toBe(parseMusicXml(STRESS_XML).notes.length);
  });

  it("沒有 container.xml 時取第一個非 META-INF 的 xml", () => {
    const zip = zipSync({ "META-INF/other.xml": strToU8("<x/>"), "song.musicxml": strToU8(STRESS_XML) });
    expect(extractMxl(zip)).toBe(STRESS_XML);
  });

  it("壞 zip 丟 not_musicxml", () => {
    expect(code(() => extractMxl(new Uint8Array([1, 2, 3, 4])))).toBe("not_musicxml");
  });

  it("zip 裡沒有 XML 丟 not_musicxml", () => {
    expect(code(() => extractMxl(zipSync({ "a.txt": strToU8("hi") })))).toBe("not_musicxml");
  });
});

describe("readScoreFile", () => {
  it("依副檔名分流", () => {
    expect(readScoreFile("a.musicxml", strToU8(STRESS_XML))).toBe(STRESS_XML);
    expect(readScoreFile("A.XML", strToU8(STRESS_XML))).toBe(STRESS_XML);
    expect(readScoreFile("a.mxl", bytes("stress.mxl"))).toBe(STRESS_XML);
  });

  it("其他副檔名丟 not_musicxml", () => {
    expect(code(() => readScoreFile("a.pdf", strToU8("%PDF")))).toBe("not_musicxml");
  });
});
