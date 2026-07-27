import { describe, it, expect } from "vitest";
import { buildAdReport, normKey } from "./ad-report.js";

const insights = [
  { campaign_id: "1", campaign_name: "Brand", date: "2026-07-27", spend: 1200, impressions: 20000, clicks: 800, reach: 9500, frequency: 2.1, meta_conversions: 3, meta_conversion_value: 11997 },
  { campaign_id: "1", campaign_name: "Brand", date: "2026-07-28", spend: 1200, impressions: 18000, clicks: 700, reach: 9000, frequency: 2.0, meta_conversions: 2, meta_conversion_value: 7998 },
  { campaign_id: "2", campaign_name: "Broad", date: "2026-07-28", spend: 4300, impressions: 88000, clicks: 1050, reach: 36700, frequency: 2.4, meta_conversions: 2, meta_conversion_value: 7998 },
];
const orders = [
  { amount: 3999, created_at: "2026-07-27T10:00:00Z", attribution: { utm_campaign: "brand" } },
  { amount: 3999, created_at: "2026-07-28T10:00:00Z", attribution: { utm_campaign: "Brand" } },
  { amount: 3999, created_at: "2026-07-28T11:00:00Z", attribution: { utm_campaign: "BRAND" } },
  { amount: 3999, created_at: "2026-07-28T12:00:00Z", attribution: { utm_campaign: "broad" } },
  { amount: 6800, created_at: "2026-07-28T09:00:00Z", attribution: null }, // 自然流量，不計入廣告
];

describe("buildAdReport", () => {
  const r = buildAdReport({ insights, paidOrders: orders, targetRoas: 3 });
  it("依 utm_campaign 正規化對接營收（大小寫容忍）", () => {
    const brand = r.campaigns.find((c) => c.campaign_id === "1");
    expect(brand.orders).toBe(3);           // 3 筆 brand 訂單
    expect(brand.revenue).toBe(11997);
    expect(brand.spend).toBe(2400);         // 兩日加總
  });
  it("未對上的訂單不計入廣告營收", () => {
    expect(r.totals.orders).toBe(4);        // 排除 attribution=null 那筆
    expect(r.totals.revenue).toBe(15996);
  });
  it("真 ROAS = 營收/花費、CPA = 花費/訂單", () => {
    const broad = r.campaigns.find((c) => c.campaign_id === "2");
    expect(broad.trueRoas).toBeCloseTo(3999 / 4300, 3);
    expect(broad.cpa).toBeCloseTo(4300, 3);
    expect(broad.status).toBe("bad");       // <1
  });
  it("狀態門檻（good≥target / warn / bad）", () => {
    const brand = r.campaigns.find((c) => c.campaign_id === "1");
    expect(brand.trueRoas).toBeCloseTo(11997 / 2400, 3); // 5.0 → good
    expect(brand.status).toBe("good");
  });
  it("best/worst 取 spend>0 的極值", () => {
    expect(r.best.campaign_id).toBe("1");
    expect(r.worst.campaign_id).toBe("2");
  });
  it("dailySeries 依日期加總花費與(對上的)營收", () => {
    const d28 = r.dailySeries.find((d) => d.date === "2026-07-28");
    expect(d28.spend).toBe(1200 + 4300);
    expect(d28.revenue).toBe(3999 * 3);     // 28 日 3 筆廣告訂單
  });
  it("空輸入不炸、configured 反映有無資料", () => {
    const e = buildAdReport({ insights: [], paidOrders: [], targetRoas: 3 });
    expect(e.campaigns).toEqual([]);
    expect(e.configured).toBe(false);
    expect(e.totals.spend).toBe(0);
  });
});

describe("normKey", () => {
  it("正規化 trim+小寫", () => { expect(normKey("  Brand ")).toBe("brand"); expect(normKey(null)).toBe(""); });
});
