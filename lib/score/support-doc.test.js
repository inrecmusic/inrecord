import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SUPPORT } from "./musicxml.js";

const DOC = readFileSync(new URL("../../docs/樂譜匯出說明-給Rick.md", import.meta.url), "utf8");

describe("給 Rick 的樂譜匯出說明與匯入規則一致", () => {
  it.each([...SUPPORT.supported, ...SUPPORT.ignored].map((x) => [x.element, x.label]))("%s：%s", (_, label) => {
    expect(DOC).toContain(label);
  });
  it("提到兩種副檔名與大譜表", () => {
    expect(DOC).toContain(".musicxml");
    expect(DOC).toContain(".mxl");
    expect(DOC).toContain("大譜表");
  });
});
