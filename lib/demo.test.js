import { describe, it, expect, afterEach } from "vitest";
import { TRIAL_SECONDS, formatTime, buyUrl } from "./demo.js";

describe("TRIAL_SECONDS", () => {
  it("固定為 120", () => { expect(TRIAL_SECONDS).toBe(120); });
});

describe("formatTime（剩餘秒數 → MM:SS）", () => {
  it("120 → 02:00", () => { expect(formatTime(120)).toBe("02:00"); });
  it("107 → 01:47", () => { expect(formatTime(107)).toBe("01:47"); });
  it("60 → 01:00", () => { expect(formatTime(60)).toBe("01:00"); });
  it("5 → 00:05", () => { expect(formatTime(5)).toBe("00:05"); });
  it("0 → 00:00", () => { expect(formatTime(0)).toBe("00:00"); });
  it("負數視為 0 → 00:00", () => { expect(formatTime(-3)).toBe("00:00"); });
  it("小數無條件捨去 → 01:47", () => { expect(formatTime(107.9)).toBe("01:47"); });
});

describe("buyUrl（WordPress 預購 URL；未設回 null）", () => {
  const KEY = "NEXT_PUBLIC_WORDPRESS_BUY_URL";
  afterEach(() => { delete process.env[KEY]; });
  it("未設定 → null", () => { delete process.env[KEY]; expect(buyUrl()).toBeNull(); });
  it("空字串 → null", () => { process.env[KEY] = ""; expect(buyUrl()).toBeNull(); });
  it("純空白 → null", () => { process.env[KEY] = "   "; expect(buyUrl()).toBeNull(); });
  it("有值 → 去頭尾空白後回傳", () => {
    process.env[KEY] = "  https://shop.example.com/course  ";
    expect(buyUrl()).toBe("https://shop.example.com/course");
  });
});
