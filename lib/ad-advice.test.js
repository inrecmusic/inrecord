import { describe, it, expect } from "vitest";
import { losingStreak, campaignAdvice, reallocation, adAdvice } from "./ad-advice.js";

const camp = (o = {}) => ({ campaign_id: "c1", campaign_name: "活動A", spend: 1000, revenue: 3000, orders: 1, cpa: 1000, trueRoas: 3, trend: [], ...o });

describe("losingStreak", () => {
  it("只算末端連續低於 1 的天數，前面爛過不算", () => {
    expect(losingStreak([0.5, 0.4, 2.0, 0.8, 0.3])).toBe(2);
    expect(losingStreak([2, 3, 4])).toBe(0);
    expect(losingStreak([])).toBe(0);
  });
});

describe("campaignAdvice", () => {
  it("花費未達門檻 → 不下結論，只觀察", () => {
    const a = campaignAdvice(camp({ spend: 100, orders: 0 }));
    expect(a.action).toBe("observe");
    expect(a.level).toBe("low");
  });
  it("有花錢但 0 成交 → 高風險、建議暫停，並提醒檢查 utm", () => {
    const a = campaignAdvice(camp({ spend: 5000, orders: 0, revenue: 0, trueRoas: 0 }));
    expect(a.action).toBe("pause");
    expect(a.level).toBe("high");
    expect(a.text).toContain("utm_campaign");
  });
  it("ROAS 低於 1 → 暫停，連續三天以上要講出來", () => {
    const a = campaignAdvice(camp({ spend: 5000, revenue: 2000, orders: 1, trueRoas: 0.4, trend: [0.2, 0.3, 0.1] }));
    expect(a.action).toBe("pause");
    expect(a.text).toContain("連續 3 天");
  });
  it("ROAS 介於 1 與目標之間 → 減碼", () => {
    expect(campaignAdvice(camp({ trueRoas: 2 })).action).toBe("reduce");
  });
  it("ROAS 達目標 1.5 倍 → 加碼；剛好達標 → 維持", () => {
    expect(campaignAdvice(camp({ trueRoas: 4.6 })).action).toBe("scale");
    expect(campaignAdvice(camp({ trueRoas: 3.1 })).action).toBe("keep");
  });
});

describe("reallocation / adAdvice", () => {
  const good = camp({ campaign_id: "g", campaign_name: "好活動", spend: 1000, revenue: 5000, orders: 5, trueRoas: 5 });
  const bad = camp({ campaign_id: "b", campaign_name: "壞活動", spend: 2000, revenue: 400, orders: 1, trueRoas: 0.2 });

  it("把該減碼的花費挪到 ROAS 最高的活動，估算可多帶的營收", () => {
    const items = [campaignAdvice(good), campaignAdvice(bad)];
    const re = reallocation([good, bad], items);
    expect(re).toMatchObject({ freed: 2000, to: "好活動", toRoas: 5, estRevenue: 10000 });
  });
  it("沒有花費的活動不進建議；完全沒花錢回 null", () => {
    expect(adAdvice({ campaigns: [camp({ spend: 0 })] })).toBe(null);
    expect(adAdvice({ campaigns: [] })).toBe(null);
  });
  it("高風險排在前面，並統計各動作筆數", () => {
    const out = adAdvice({ campaigns: [good, bad] });
    expect(out.items[0].level).toBe("high");
    expect(out.counts).toMatchObject({ pause: 1, scale: 1 });
  });
});
