import { describe, it, expect } from "vitest";
import { isFanProofOpen, buildFanCoupon, FAN_PRICE, FAN_PLAN, FAN_PROOF_DEADLINE } from "./fan-proof.js";

describe("isFanProofOpen", () => {
  it("截止前為 true", () => {
    expect(isFanProofOpen(new Date("2026-09-03T23:00:00+08:00"))).toBe(true);
  });
  it("截止當下邊界（23:59:59）為 true", () => {
    expect(isFanProofOpen(new Date("2026-09-03T23:59:59+08:00"))).toBe(true);
  });
  it("9/4 00:00 之後為 false", () => {
    expect(isFanProofOpen(new Date("2026-09-04T00:00:00+08:00"))).toBe(false);
  });
});

describe("buildFanCoupon", () => {
  it("產生 bundle 一次性 price=3499 券", () => {
    const c = buildFanCoupon({ code: "FANABCD1234", now: new Date("2026-06-23T10:00:00+08:00") });
    expect(c).toMatchObject({
      code: "FANABCD1234",
      type: "price",
      value: 3499,
      plan: "bundle",
      usage_limit: 1,
      status: "active",
      starts_at: null,
      ends_at: null,
    });
    expect(c.name).toContain("粉絲");
  });
});

describe("常數", () => {
  it("FAN_PRICE=3499 / FAN_PLAN=bundle", () => {
    expect(FAN_PRICE).toBe(3499);
    expect(FAN_PLAN).toBe("bundle");
    expect(typeof FAN_PROOF_DEADLINE).toBe("number");
  });
});
