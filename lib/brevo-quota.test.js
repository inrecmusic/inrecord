import { describe, it, expect } from "vitest";
import { pickSendLimitPlan, planWindow, quotaSummary } from "./brevo-quota.js";

const NOW = new Date("2026-09-20T03:00:00.000Z");
const free = { plan: [{ type: "free", creditsType: "sendLimit", credits: 300 }] };
const starter = { plan: [{ type: "subscription", creditsType: "sendLimit", credits: 5000, startDate: "2026-09-02" }] };

describe("brevo 額度期間", () => {
  it("免費方案：期間＝今天（每日上限）", () => {
    expect(planWindow(pickSendLimitPlan(free), NOW)).toEqual({
      daily: true, period: "day", start: "2026-09-20", end: "2026-09-20",
    });
  });

  it("付費方案：期間＝計費週期起日至今，不是只算今天", () => {
    expect(planWindow(pickSendLimitPlan(starter), NOW)).toEqual({
      daily: false, period: "cycle", start: "2026-09-02", end: "2026-09-20",
    });
  });

  it("付費方案但 Brevo 沒回 startDate → 退回當月 1 日", () => {
    const noStart = { plan: [{ type: "subscription", creditsType: "sendLimit", credits: 5000 }] };
    expect(planWindow(pickSendLimitPlan(noStart), NOW).start).toBe("2026-09-01");
  });

  it("略過非 sendLimit 的額度項（如 SMS）", () => {
    const mixed = { plan: [{ type: "free", creditsType: "sendSms", credits: 10 }, ...starter.plan] };
    expect(pickSendLimitPlan(mixed).creditsType).toBe("sendLimit");
  });
});

describe("額度摘要", () => {
  it("付費方案：以整期已寄數扣抵，期間資訊一併回傳給 UI 標示", () => {
    expect(quotaSummary(starter, 1200, NOW)).toEqual({
      planType: "subscription", period: "cycle", periodStart: "2026-09-02", periodEnd: "2026-09-20",
      daily: false, limit: 5000, used: 1200, remaining: 3800,
    });
  });

  it("方案沒回上限 → 只報已寄數，remaining 為 null（不臆測）", () => {
    const noCredits = { plan: [{ type: "subscription", creditsType: "sendLimit" }] };
    const s = quotaSummary(noCredits, 42, NOW);
    expect(s.limit).toBe(null);
    expect(s.remaining).toBe(null);
    expect(s.used).toBe(42);
  });

  it("已寄數超過上限 → 剩餘不會變負數", () => {
    expect(quotaSummary(free, 350, NOW).remaining).toBe(0);
  });

  it("統計拿不到 requests → 已寄數當 0，不讓面板壞掉", () => {
    expect(quotaSummary(free, undefined, NOW).used).toBe(0);
  });
});
