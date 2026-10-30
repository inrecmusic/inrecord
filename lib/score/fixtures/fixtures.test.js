import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { DOMParser } from "@xmldom/xmldom";

const read = (name) => readFileSync(new URL(`./${name}`, import.meta.url));

describe("自製 MusicXML 測試檔", () => {
  it.each(["twinkle-grand.musicxml", "stress.musicxml", "single-staff.musicxml", "twinkle-melody.musicxml"])("%s 解析得出 score-partwise", (name) => {
    const errors = [];
    const doc = new DOMParser({ onError: (level, msg) => level !== "warning" && errors.push(msg) })
      .parseFromString(read(name).toString("utf8"), "text/xml");
    expect(errors).toEqual([]);
    expect(doc.getElementsByTagName("parsererror").length).toBe(0);
    expect(doc.documentElement.nodeName).toBe("score-partwise");
  });

  it("stress.mxl 是 zip 檔", () => {
    const b = read("stress.mxl");
    expect(String.fromCharCode(b[0], b[1])).toBe("PK");
  });
});
