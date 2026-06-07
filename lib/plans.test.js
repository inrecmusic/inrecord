import { describe, it, expect } from "vitest";
import { PLAN_CATALOG, applyCoupon, couponError } from "./plans.js";

describe("PLAN_CATALOG（後端權威價格）", () => {
  it("三方案的 key、價格、品名與規格一致", () => {
    expect(PLAN_CATALOG.course).toEqual({ price: 3800, label: "課程單賣" });
    expect(PLAN_CATALOG.bundle).toEqual({ price: 3999, label: "課程包 AI" });
    expect(PLAN_CATALOG.game).toEqual({ price: 1200, label: "AI 遊戲單買" });
  });

  it("不存在未預期的方案 key", () => {
    expect(Object.keys(PLAN_CATALOG).sort()).toEqual(["bundle", "course", "game"]);
  });
});

describe("applyCoupon", () => {
  it("無優惠券時回傳原價", () => {
    expect(applyCoupon(3800, null)).toBe(3800);
    expect(applyCoupon(3800, undefined)).toBe(3800);
  });

  it("percent 折扣四捨五入", () => {
    // 3999 * (1 - 0.1) = 3599.1 → 3599
    expect(applyCoupon(3999, { type: "percent", value: 10 })).toBe(3599);
    // 3800 * 0.85 = 3230
    expect(applyCoupon(3800, { type: "percent", value: 15 })).toBe(3230);
    // 1200 * 0.50 = 600
    expect(applyCoupon(1200, { type: "percent", value: 50 })).toBe(600);
  });

  it("percent 100% 折到 0", () => {
    expect(applyCoupon(3800, { type: "percent", value: 100 })).toBe(0);
  });

  it("fixed 折抵固定金額", () => {
    expect(applyCoupon(3800, { type: "fixed", value: 500 })).toBe(3300);
    expect(applyCoupon(1200, { type: "fixed", value: 200 })).toBe(1000);
  });

  it("折後價不會低於 0", () => {
    expect(applyCoupon(1200, { type: "fixed", value: 5000 })).toBe(0);
    expect(applyCoupon(1200, { type: "percent", value: 200 })).toBe(0);
  });
});

describe("couponError", () => {
  const now = new Date("2026-06-08T12:00:00+08:00");
  const valid = {
    code: "SAVE10",
    type: "percent",
    value: 10,
    status: "active",
    starts_at: "2026-06-01",
    ends_at: "2026-06-30",
    used: 0,
    usage_limit: 100,
  };

  it("有效優惠券回傳 null", () => {
    expect(couponError(valid, now)).toBeNull();
  });

  it("找不到優惠券", () => {
    expect(couponError(null, now)).toBe("coupon_not_found");
    expect(couponError(undefined, now)).toBe("coupon_not_found");
  });

  it("停用狀態", () => {
    expect(couponError({ ...valid, status: "disabled" }, now)).toBe("coupon_inactive");
  });

  it("尚未開始", () => {
    expect(couponError({ ...valid, starts_at: "2026-07-01" }, now)).toBe("coupon_not_started");
  });

  it("已過期（ends_at 早於今天）", () => {
    expect(couponError({ ...valid, ends_at: "2026-06-07" }, now)).toBe("coupon_expired");
  });

  it("ends_at 當天仍有效（包含整天到 23:59:59）", () => {
    expect(couponError({ ...valid, ends_at: "2026-06-08" }, now)).toBeNull();
  });

  it("用量達上限", () => {
    expect(couponError({ ...valid, used: 100, usage_limit: 100 }, now)).toBe("coupon_used_up");
    expect(couponError({ ...valid, used: 150, usage_limit: 100 }, now)).toBe("coupon_used_up");
  });

  it("usage_limit 為 null 代表無限制", () => {
    expect(couponError({ ...valid, used: 9999, usage_limit: null }, now)).toBeNull();
  });

  it("無 starts_at / ends_at 時不檢查時間", () => {
    expect(couponError({ ...valid, starts_at: null, ends_at: null }, now)).toBeNull();
  });
});
