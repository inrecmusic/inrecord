import { describe, it, expect } from "vitest";
import { isHandoutUnit, HANDOUT_UNIT_MARK } from "./handout-unit.js";
import { parseDurationSeconds } from "./duration.js";

describe("isHandoutUnit", () => {
  it("時長標記為講義、沒有影片 → 純講義單元", () => {
    expect(isHandoutUnit({ duration: HANDOUT_UNIT_MARK })).toBe(true);
  });
  it("影片還沒上架的一般單元不算", () => {
    expect(isHandoutUnit({ duration: "12:40" })).toBe(false);
    expect(isHandoutUnit({ duration: null })).toBe(false);
    expect(isHandoutUnit(null)).toBe(false);
  });
  it("後來掛上影片就回到一般單元", () => {
    expect(isHandoutUnit({ duration: HANDOUT_UNIT_MARK, bunny_video_id: "abc" })).toBe(false);
  });
  it("標記不會被當成影片長度", () => {
    expect(parseDurationSeconds(HANDOUT_UNIT_MARK)).toBe(0);
  });
});
