import { describe, it, expect } from "vitest";
import { groupBySource } from "./attribution-report.js";

describe("groupBySource", () => {
  it("依 source/campaign 分組並加總營收，無歸因歸直接", () => {
    const rows = groupBySource([
      { amount: 5800, attribution: { utm_source: "facebook", utm_campaign: "summer" } },
      { amount: 5800, attribution: { utm_source: "facebook", utm_campaign: "summer" } },
      { amount: 4299, attribution: { utm_source: "google" } },
      { amount: 6800, attribution: null },
    ]);
    expect(rows[0]).toEqual({ source: "facebook / summer", orders: 2, revenue: 11600 });
    const direct = rows.find((r) => r.source === "直接／自然");
    expect(direct).toEqual({ source: "直接／自然", orders: 1, revenue: 6800 });
  });
  it("空陣列回空", () => expect(groupBySource([])).toEqual([]));
});
