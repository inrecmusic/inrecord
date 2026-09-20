import { describe, it, expect } from "vitest";
import { parseDurationSeconds } from "./duration.js";

describe("parseDurationSeconds（後台 duration 文字 → 秒）", () => {
  it("mm:ss", () => {
    expect(parseDurationSeconds("12:40")).toBe(760);
    expect(parseDurationSeconds("0:45")).toBe(45);
  });
  it("hh:mm:ss", () => {
    expect(parseDurationSeconds("1:02:03")).toBe(3723);
  });
  it("前後空白與全形冒號照樣解析", () => {
    expect(parseDurationSeconds("  12:40 ")).toBe(760);
    expect(parseDurationSeconds("12：40")).toBe(760);
  });
  it("純數字視為秒", () => {
    expect(parseDurationSeconds("600")).toBe(600);
  });
  it("解析不出來或非正數 → 0（呼叫端退回舊行為）", () => {
    for (const v of [null, undefined, "", "abc", "0:00", "-5", "12:99", {}, []]) {
      expect(parseDurationSeconds(v)).toBe(0);
    }
  });
});
