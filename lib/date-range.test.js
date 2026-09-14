import { describe, it, expect } from "vitest";
import { inDateRange, validateDateRange } from "./date-range.js";

describe("inDateRange", () => {
  it("無篩選 → 一律 true（連無效時間也不排除）", () => {
    expect(inDateRange("2026-06-26T12:00:00", "", "")).toBe(true);
    expect(inDateRange("not-a-date", "", "")).toBe(true);
  });

  it("from：早於起日 → false；晚於起日 → true", () => {
    expect(inDateRange("2026-06-20T12:00:00", "2026-06-26", "")).toBe(false);
    expect(inDateRange("2026-06-28T12:00:00", "2026-06-26", "")).toBe(true);
  });

  it("to：晚於迄日 → false；早於/當日 → true", () => {
    expect(inDateRange("2026-06-28T12:00:00", "", "2026-06-26")).toBe(false);
    expect(inDateRange("2026-06-24T12:00:00", "", "2026-06-26")).toBe(true);
    expect(inDateRange("2026-06-26T12:00:00", "", "2026-06-26")).toBe(true); // 迄日當天含整天
  });

  it("起訖日以台灣時間解讀：台灣 00:00～07:59 的訂單在起始日當天篩得到、迄日到 23:59 都算", () => {
    expect(inDateRange("2026-06-26T02:00:00+08:00", "2026-06-26", "")).toBe(true);  // 舊版把起日當 UTC 00:00（台灣 08:00）會漏掉
    expect(inDateRange("2026-06-25T23:30:00+08:00", "2026-06-26", "")).toBe(false);
    expect(inDateRange("2026-06-26T23:59:00+08:00", "", "2026-06-26")).toBe(true);
    expect(inDateRange("2026-06-27T00:30:00+08:00", "", "2026-06-26")).toBe(false);
  });

  it("有篩選但時間無效 → false（無法歸入區間）", () => {
    expect(inDateRange("not-a-date", "2026-06-26", "")).toBe(false);
  });
});

describe("validateDateRange", () => {
  it("皆空 → ok", () => {
    expect(validateDateRange(null, null)).toEqual({ ok: true });
    expect(validateDateRange("", "")).toEqual({ ok: true });
  });
  it("合法且先後正確 → ok", () => {
    expect(validateDateRange("2026-08-01", "2026-08-06")).toEqual({ ok: true });
  });
  it("起 > 迄 → starts_after_ends", () => {
    expect(validateDateRange("2026-08-07", "2026-08-06")).toEqual({ ok: false, error: "starts_after_ends" });
  });
  it("格式錯誤 → invalid_starts_at / invalid_ends_at", () => {
    expect(validateDateRange("nope", "2026-08-06")).toEqual({ ok: false, error: "invalid_starts_at" });
    expect(validateDateRange("2026-08-01", "nope")).toEqual({ ok: false, error: "invalid_ends_at" });
  });
  it("只給其中一個且合法 → ok", () => {
    expect(validateDateRange("2026-08-01", null)).toEqual({ ok: true });
    expect(validateDateRange(null, "2026-08-06")).toEqual({ ok: true });
  });
});
