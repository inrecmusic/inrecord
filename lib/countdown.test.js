import { describe, it, expect } from "vitest";
import { formatCountdownParts } from "./countdown.js";

describe("formatCountdownParts", () => {
  it("3 天 4 時 5 分 6 秒 → 補零字串", () => {
    const ms = (((3 * 24 + 4) * 60 + 5) * 60 + 6) * 1000;
    expect(formatCountdownParts(ms)).toEqual({ d: 3, h: "04", m: "05", s: "06" });
  });
  it("整點：時分秒補零", () => {
    expect(formatCountdownParts(24 * 3600000)).toEqual({ d: 1, h: "00", m: "00", s: "00" });
  });
  it("負數歸零", () => {
    expect(formatCountdownParts(-1)).toEqual({ d: 0, h: "00", m: "00", s: "00" });
  });
});
