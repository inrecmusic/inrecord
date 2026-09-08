import { describe, it, expect } from "vitest";
import { buildReportEmail } from "./email.js";

describe("buildReportEmail", () => {
  it("主旨含期間；內文有總結、重點、風險、建議（附後台提示）、數字表", () => {
    const { subject, bodyMd } = buildReportEmail({
      headline: "穩定成長", highlights: ["付款 8 筆（上週 5）"], risks: [{ level: "high", text: "2 位付款未開通" }],
      suggestions: [{ title: "開通名單", why: "付了錢等課", admin_path: "orders" }], metrics: { paid: 8, prev_paid: 5 },
    }, "9/7–9/13");
    expect(subject).toBe("InRecord 營運週報 9/7–9/13");
    expect(bodyMd).toContain("## 本週一句話");
    expect(bodyMd).toContain("- 付款 8 筆（上週 5）");
    expect(bodyMd).toContain("🔴 2 位付款未開通");
    expect(bodyMd).toContain("**開通名單**（後台 → 訂單管理）");
    expect(bodyMd).toContain("| paid | 8 |");
  });
});
