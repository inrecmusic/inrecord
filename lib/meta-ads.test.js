import { describe, it, expect } from "vitest";
import { normalizeInsightRow } from "./meta-ads.js";

describe("normalizeInsightRow", () => {
  it("字串數值轉數字、日期取 date_start", () => {
    const r = normalizeInsightRow({ campaign_id: "1", campaign_name: "Brand", date_start: "2026-07-28", date_stop: "2026-07-28", spend: "1200.50", impressions: "20000", clicks: "800", reach: "9500", frequency: "2.11", ctr: "4.0", cpc: "1.5", cpm: "60" });
    expect(r.campaign_id).toBe("1"); expect(r.spend).toBeCloseTo(1200.5, 2);
    expect(r.impressions).toBe(20000); expect(r.date).toBe("2026-07-28");
    expect(r.frequency).toBeCloseTo(2.11, 2);
  });
  it("從 actions/action_values 抽購買（含 pixel/omni 別名）", () => {
    const r = normalizeInsightRow({ campaign_id: "1", date_start: "2026-07-28", spend: "100",
      actions: [{ action_type: "link_click", value: "50" }, { action_type: "offsite_conversion.fb_pixel_purchase", value: "3" }],
      action_values: [{ action_type: "offsite_conversion.fb_pixel_purchase", value: "11997" }] });
    expect(r.meta_conversions).toBe(3); expect(r.meta_conversion_value).toBeCloseTo(11997, 2);
  });
  it("無 actions 時購買為 0、缺欄不炸", () => {
    const r = normalizeInsightRow({ campaign_id: "2", date_start: "2026-07-28" });
    expect(r.meta_conversions).toBe(0); expect(r.spend).toBe(0);
  });
});
