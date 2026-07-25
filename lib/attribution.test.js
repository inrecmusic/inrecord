import { describe, it, expect } from "vitest";
import { parseAttribution, hasTouch, mergeLastTouch } from "./attribution.js";

describe("parseAttribution", () => {
  it("擷取 utm 與 click id，忽略空值", () => {
    const out = parseAttribution("utm_source=facebook&utm_campaign=summer&fbclid=abc&foo=bar");
    expect(out).toEqual({ utm_source: "facebook", utm_campaign: "summer", fbclid: "abc" });
  });
  it("無參數回空物件", () => {
    expect(parseAttribution("")).toEqual({});
  });
});

describe("hasTouch", () => {
  it("有任一來源值為 true", () => expect(hasTouch({ utm_source: "fb" })).toBe(true));
  it("空為 false", () => { expect(hasTouch({})).toBe(false); expect(hasTouch(null)).toBe(false); });
});

describe("mergeLastTouch", () => {
  it("next 有 touch → 覆蓋", () => {
    expect(mergeLastTouch({ utm_source: "old" }, { utm_source: "new" })).toEqual({ utm_source: "new" });
  });
  it("next 為 direct（無 touch）→ 保留 prev", () => {
    expect(mergeLastTouch({ utm_source: "old" }, {})).toEqual({ utm_source: "old" });
  });
  it("prev 為 null 且 next direct → null", () => {
    expect(mergeLastTouch(null, {})).toBeNull();
  });
});
