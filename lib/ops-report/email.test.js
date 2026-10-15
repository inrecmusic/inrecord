import { describe, it, expect } from "vitest";
import { buildReportEmail } from "./email.js";

describe("buildReportEmail", () => {
  it("主旨含期間；內文依序：一句話、核心指標本週／上週表、重點、風險（只有 high）、建議（做什麼＋後台頁）、更多數字", () => {
    const { subject, bodyMd } = buildReportEmail({
      headline: "穩定成長", highlights: ["付款 8 筆（上週 5）"],
      risks: [{ level: "high", text: "2 位付款未開通" }, { level: "medium", text: "中等的不要出現" }],
      suggestions: [{ title: "開通名單", why: "舊欄位不要印", admin_path: "orders" }], metrics: { paid: 8, prev_paid: 5 },
      core: { revenue: { this_week: 34392, last_week: 22195 }, paid_orders: { this_week: 8, last_week: 5 }, ad_spend: { this_week: null, last_week: null } },
    }, "9/7–9/13");
    expect(subject).toBe("InRecord 營運週報 9/7–9/13");
    expect(bodyMd).toContain("## 本週一句話");
    expect(bodyMd).toContain("| 指標 | 本週 | 上週 |");
    expect(bodyMd).toContain("| 營收 | NT$34,392 | NT$22,195 |");
    expect(bodyMd).toContain("| 已付款訂單 | 8 | 5 |");
    expect(bodyMd).toContain("| 廣告花費 | — | — |");
    expect(bodyMd).toContain("- 付款 8 筆（上週 5）");
    expect(bodyMd).toContain("🔴 2 位付款未開通");
    expect(bodyMd).not.toContain("中等的不要出現");
    expect(bodyMd).toContain("- **開通名單**（後台 → 訂單管理）");
    expect(bodyMd).not.toContain("舊欄位不要印");
    expect(bodyMd).toContain("## 更多數字");
    expect(bodyMd).toContain("| paid | 8 |");
    const order = ["## 本週一句話", "## 核心指標", "## 重點", "## 風險", "## 建議", "## 更多數字"].map((h) => bodyMd.indexOf(h));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it("舊報告沒有 core：不畫核心指標表，其餘照常", () => {
    const { bodyMd } = buildReportEmail({ headline: "舊", highlights: [], risks: [], suggestions: [], metrics: {} }, "9/7–9/13");
    expect(bodyMd).not.toContain("## 核心指標");
    expect(bodyMd).toContain("完整報告與歷史紀錄在後台「營運助理」");
  });
});
