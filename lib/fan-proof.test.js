import { describe, it, expect } from "vitest";
import { isFanProofOpen, buildFanCoupon, isOwnProofUrl, FAN_PRICE, FAN_PLAN, FAN_PROOF_DEADLINE, FAN_DIRECT_PRICE } from "./fan-proof.js";

describe("isFanProofOpen", () => {
  it("截止前為 true", () => {
    expect(isFanProofOpen(new Date("2026-08-06T23:00:00+08:00"))).toBe(true);
  });
  it("截止當下邊界（23:59:59）為 true", () => {
    expect(isFanProofOpen(new Date("2026-08-06T23:59:59+08:00"))).toBe(true);
  });
  it("8/7 00:00 之後為 false", () => {
    expect(isFanProofOpen(new Date("2026-08-07T00:00:00+08:00"))).toBe(false);
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

describe("isOwnProofUrl", () => {
  const SB = "https://abcdefg.supabase.co";
  it("自家 storage proof-uploads 公開 URL → true", () => {
    expect(isOwnProofUrl(`${SB}/storage/v1/object/public/proof-uploads/proofs/1_x.jpg`, SB)).toBe(true);
  });
  it("外部 https 主機 → false（擋 admin SSRF/釣魚）", () => {
    expect(isOwnProofUrl("https://evil.com/x.png", SB)).toBe(false);
  });
  it("自家主機但其他 bucket 路徑 → false", () => {
    expect(isOwnProofUrl(`${SB}/storage/v1/object/public/other-bucket/x.jpg`, SB)).toBe(false);
  });
  it("非 https（http）→ false", () => {
    expect(isOwnProofUrl(`http://abcdefg.supabase.co/storage/v1/object/public/proof-uploads/x.jpg`, SB)).toBe(false);
  });
  it("超過 2048 字元 → false", () => {
    expect(isOwnProofUrl(`${SB}/storage/v1/object/public/proof-uploads/${"a".repeat(2100)}`, SB)).toBe(false);
  });
  it("非字串 / 壞 URL / 缺 supabaseUrl → false", () => {
    expect(isOwnProofUrl(null, SB)).toBe(false);
    expect(isOwnProofUrl("not a url", SB)).toBe(false);
    expect(isOwnProofUrl(`${SB}/storage/v1/object/public/proof-uploads/x.jpg`, "")).toBe(false);
  });
});

describe("isFanProofOpen 帶 deadline 參數", () => {
  const dlStr = "2026-09-03T23:59:59+08:00";
  it("自訂 deadline(字串)：截止前 true、截止後 false", () => {
    expect(isFanProofOpen(new Date("2026-09-01T00:00:00+08:00"), dlStr)).toBe(true);
    expect(isFanProofOpen(new Date("2026-09-04T00:00:00+08:00"), dlStr)).toBe(false);
  });
  it("自訂 deadline(ms number)", () => {
    const dl = Date.parse(dlStr);
    expect(isFanProofOpen(new Date("2026-09-01T00:00:00+08:00"), dl)).toBe(true);
    expect(isFanProofOpen(new Date("2026-09-04T00:00:00+08:00"), dl)).toBe(false);
  });
});

describe("buildFanCoupon 帶 price 參數", () => {
  it("自訂 price 寫進 value", () => {
    expect(buildFanCoupon({ code: "FANX1234", price: 3299 })).toMatchObject({ value: 3299, type: "price", plan: "bundle", usage_limit: 1 });
  });
  it("不帶 price 用 FAN_PRICE 預設", () => {
    expect(buildFanCoupon({ code: "FANX1234" }).value).toBe(FAN_PRICE);
  });
});

describe("FAN_DIRECT_PRICE 常數", () => {
  it("= 3999", () => { expect(FAN_DIRECT_PRICE).toBe(3999); });
});
