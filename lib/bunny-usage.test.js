import { describe, it, expect } from "vitest";
import { summarizeBilling } from "./bunny-usage";

// Bunny GET /billing 回傳（節錄）：ThisMonthCharges / Balance 為美元，MonthlyBandwidthUsed 為 bytes
const BILLING = {
  Balance: 46.8,
  ThisMonthCharges: 3.21,
  MonthlyChargesStorage: 0.5,
  MonthlyBandwidthUsed: 642_000_000_000,
};

describe("summarizeBilling", () => {
  it("整理成後台要顯示的欄位，頻寬 bytes 轉 GB（小數兩位）", () => {
    const at = new Date("2026-09-04T13:40:00Z");
    expect(summarizeBilling(BILLING, at)).toEqual({
      thisMonthCharges: 3.21,
      balance: 46.8,
      storageCharges: 0.5,
      bandwidthGB: 642,
      fetchedAt: "2026-09-04T13:40:00.000Z",
    });
  });

  it("缺欄位或非數字一律當 0，不會出現 NaN", () => {
    const s = summarizeBilling({ Balance: "x" }, new Date(0));
    expect(s.thisMonthCharges).toBe(0);
    expect(s.balance).toBe(0);
    expect(s.storageCharges).toBe(0);
    expect(s.bandwidthGB).toBe(0);
  });
});
