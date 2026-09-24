import { describe, it, expect } from "vitest";
import { atmExpireParams, couponEndsAtMs, MIN_TRANSFER_WINDOW_MS } from "./payuni-expire";

// 台灣 2026-09-24 10:00
const NOW = new Date("2026-09-24T02:00:00Z");
const H = 3_600_000, D = 24 * H;

describe("atmExpireParams（ATM／超商繳費期限跟優惠價同天失效）", () => {
  it("沒有截止（正式牌價）→ 不帶參數，用 PAYUNi 預設 +7 天", () => {
    expect(atmExpireParams({ deadlines: [], now: NOW })).toEqual({});
    expect(atmExpireParams({ deadlines: [NaN, undefined], now: NOW })).toEqual({});
  });

  it("波段 ends_at 是台灣隔日 00:00（exclusive）→ ExpireDate 是波段最後一天", () => {
    const endsAt = Date.parse("2026-10-01T16:00:00Z"); // 台灣 10/2 00:00
    const now = new Date("2026-09-27T02:00:00Z"); // 台灣 9/27 10:00（截止在 +7 天內才需要帶）
    expect(atmExpireParams({ deadlines: [endsAt], now })).toEqual({ ExpireDate: "2026-10-01" });
  });

  it("粉絲截止 23:59（inclusive）→ ExpireDate 就是當天", () => {
    const deadline = Date.parse("2026-09-26T15:59:00Z"); // 台灣 9/26 23:59
    expect(atmExpireParams({ deadlines: [deadline], now: NOW })).toEqual({ ExpireDate: "2026-09-26" });
  });

  it("多個截止取最早的", () => {
    const fan = Date.parse("2026-09-26T15:59:00Z"), wave = Date.parse("2026-10-01T16:00:00Z");
    expect(atmExpireParams({ deadlines: [wave, fan], now: NOW })).toEqual({ ExpireDate: "2026-09-26" });
  });

  it("截止晚於 +7 天 → 不帶（PAYUNi 預設已夠，帶超過 +7 天會藏起超商代碼）", () => {
    expect(atmExpireParams({ deadlines: [NOW.getTime() + 8 * D], now: NOW })).toEqual({});
    // 剛好落在第 7 天也不帶（與預設同一天）
    expect(atmExpireParams({ deadlines: [NOW.getTime() + 7 * D + H], now: NOW })).toEqual({});
  });

  it("截止當天且剩不到 2 小時 → 只開信用卡（PAYUNi 規定當日期限至少留 2 小時，否則得設隔日）", () => {
    const now = new Date("2026-09-26T14:30:00Z"); // 台灣 9/26 22:30
    const deadline = Date.parse("2026-09-26T15:59:00Z"); // 23:59
    expect(atmExpireParams({ deadlines: [deadline], now })).toEqual({ Credit: "1" });
    // 剛好 2 小時：還能帶當日
    const at2h = new Date(deadline - MIN_TRANSFER_WINDOW_MS);
    expect(atmExpireParams({ deadlines: [deadline], now: at2h })).toEqual({ ExpireDate: "2026-09-26" });
  });
});

describe("couponEndsAtMs", () => {
  it("DATE 字串當台灣當日 23:59:59.999", () => {
    expect(couponEndsAtMs("2026-09-30")).toBe(Date.parse("2026-09-30T15:59:59.999Z"));
  });
  it("空值 → NaN（會被 atmExpireParams 忽略）", () => {
    expect(couponEndsAtMs(null)).toBeNaN();
    expect(couponEndsAtMs("")).toBeNaN();
  });
  it("完整 ISO 字串照 Date.parse", () => {
    expect(couponEndsAtMs("2026-09-30T12:00:00Z")).toBe(Date.parse("2026-09-30T12:00:00Z"));
  });
});
