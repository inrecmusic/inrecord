import { describe, it, expect } from "vitest";
import { buildAdDailyEmail } from "./ad-daily.js";

const report = {
  totals: { spend: 3000, revenue: 9000, orders: 3, trueRoas: 3 },
  campaigns: [
    { campaign_id: "g", campaign_name: "好活動", spend: 1000, revenue: 8000, orders: 2, cpa: 500, trueRoas: 8, trend: [] },
    { campaign_id: "b", campaign_name: "壞活動", spend: 2000, revenue: 1000, orders: 1, cpa: 2000, trueRoas: 0.5, trend: [0.4, 0.3] },
  ],
};

describe("buildAdDailyEmail", () => {
  it("昨天沒花錢 → 回 null（不寄空信）", () => {
    expect(buildAdDailyEmail({ report: { totals: { spend: 0 } }, dayLabel: "9/17" })).toBe(null);
    expect(buildAdDailyEmail({ dayLabel: "9/17" })).toBe(null);
  });
  it("主旨帶日期、花費與 ROAS", () => {
    const { subject } = buildAdDailyEmail({ report, dayLabel: "9/17" });
    expect(subject).toBe("廣告日報 9/17｜花費 NT$3,000・ROAS 3");
  });
  it("內文含各活動數字、建議動作與預算挪移估算", () => {
    const { html } = buildAdDailyEmail({ report, dayLabel: "9/17" });
    expect(html).toContain("好活動");
    expect(html).toContain("壞活動");
    expect(html).toContain("建議動作");
    expect(html).toContain("預算配置");
    expect(html).toContain("淨賺");
  });
  it("虧損時講「淨損」不講「淨賺」", () => {
    const loss = { totals: { spend: 5000, revenue: 1000, orders: 1, trueRoas: 0.2 }, campaigns: report.campaigns };
    expect(buildAdDailyEmail({ report: loss, dayLabel: "9/17" }).html).toContain("淨損");
  });
});
