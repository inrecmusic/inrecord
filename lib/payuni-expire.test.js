import { describe, it, expect } from "vitest";
import { atmExpireParams, couponEndsAtMs, MIN_TRANSFER_WINDOW_MS, INSTANT_ONLY } from "./payuni-expire";

// 台灣 2026-09-24 10:00
const NOW = new Date("2026-09-24T02:00:00Z");
const tw = (s) => Date.parse(`${s}+08:00`); // 台灣時間字串 → ms
const M = 60_000;

describe("atmExpireParams（ATM／超商繳費期限跟優惠價同天失效）", () => {
  it("沒有截止（正式牌價）→ 不帶參數，用 PAYUNi 預設 +7 天", () => {
    expect(atmExpireParams({ deadlines: [], now: NOW })).toEqual({});
    expect(atmExpireParams({ deadlines: [NaN, undefined], now: NOW })).toEqual({});
  });

  it("波段 ends_at 是台灣隔日 00:00（exclusive）→ ExpireDate 是波段最後一天", () => {
    const now = new Date("2026-09-27T02:00:00Z"); // 台灣 9/27 10:00（截止在 +7 天內才需要帶）
    expect(atmExpireParams({ deadlines: [tw("2026-10-02T00:00:00")], now })).toEqual({ ExpireDate: "2026-10-01" });
  });

  it("粉絲截止 23:59（inclusive）→ ExpireDate 就是當天", () => {
    expect(atmExpireParams({ deadlines: [tw("2026-09-26T23:59:00")], now: NOW })).toEqual({ ExpireDate: "2026-09-26" });
  });

  it("多個截止取最早的", () => {
    expect(atmExpireParams({ deadlines: [tw("2026-10-02T00:00:00"), tw("2026-09-26T23:59:00")], now: NOW }))
      .toEqual({ ExpireDate: "2026-09-26" });
  });

  it("截止不在日界（後台把波段迄設成 20:00）→ 只能保證到前一天", () => {
    const deadline = tw("2026-10-05T20:00:00");
    expect(atmExpireParams({ deadlines: [deadline], now: new Date(tw("2026-10-03T10:00:00")) })).toEqual({ ExpireDate: "2026-10-04" });
    // 前一天晚上還有 4 小時可付 → 仍給前一天
    expect(atmExpireParams({ deadlines: [deadline], now: new Date(tw("2026-10-04T20:00:00")) })).toEqual({ ExpireDate: "2026-10-04" });
    // 截止當天（前一天已過）→ 不給 ATM／超商
    expect(atmExpireParams({ deadlines: [deadline], now: new Date(tw("2026-10-05T10:00:00")) })).toEqual({ Credit: "1", Aftee: "1" });
  });

  it("截止不早於 +7 天 → 不帶（PAYUNi 預設已夠，帶超過 +7 天會藏起超商代碼）", () => {
    // NOW 9/24：+7 天＝10/1；波段 10/2 00:00 結束＝最後一天 10/1，與預設同天 → 不帶
    expect(atmExpireParams({ deadlines: [tw("2026-10-02T00:00:00")], now: NOW })).toEqual({});
    expect(atmExpireParams({ deadlines: [tw("2026-10-03T00:00:00")], now: NOW })).toEqual({});
    // 10/1 00:00 結束＝最後一天 9/30，早於預設 → 帶
    expect(atmExpireParams({ deadlines: [tw("2026-10-01T00:00:00")], now: NOW })).toEqual({ ExpireDate: "2026-09-30" });
  });

  it("到期日結尾剩不到最短繳費時間（2 小時＋15 分緩衝）→ 只開信用卡與 AFTEE", () => {
    const deadline = tw("2026-09-26T23:59:00");
    const dayEnd = tw("2026-09-26T23:59:59.999");
    expect(atmExpireParams({ deadlines: [deadline], now: new Date(dayEnd - MIN_TRANSFER_WINDOW_MS + M) })).toEqual({ ...INSTANT_ONLY });
    // 剛好夠：還能帶當日
    expect(atmExpireParams({ deadlines: [deadline], now: new Date(dayEnd - MIN_TRANSFER_WINDOW_MS) })).toEqual({ ExpireDate: "2026-09-26" });
    // 期限已過（券驗證與此處對日期的解讀可能差幾小時）→ 同樣只開即時付款，不會丟出 ATM
    expect(atmExpireParams({ deadlines: [deadline], now: new Date(tw("2026-09-27T03:00:00")) })).toEqual({ Credit: "1", Aftee: "1" });
  });

  it("INSTANT_ONLY 回傳的是副本，改不到常數", () => {
    const r = atmExpireParams({ deadlines: [NOW.getTime() - 1], now: NOW });
    r.Credit = "0";
    expect(INSTANT_ONLY.Credit).toBe("1");
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
