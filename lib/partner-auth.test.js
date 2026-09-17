import { describe, it, expect } from "vitest";
import { partnerKeyConfigured, verifyPartnerKey } from "./partner-auth.js";

const KEY = "k".repeat(32);
const reqWith = (v) => ({ headers: { get: (n) => (n.toLowerCase() === "authorization" ? v : null) } });

describe("partnerKeyConfigured", () => {
  it("未設或太短 → 視為未設定（功能整個關閉）", () => {
    expect(partnerKeyConfigured({})).toBe(false);
    expect(partnerKeyConfigured({ PARTNER_ADS_KEY: "short" })).toBe(false);
    expect(partnerKeyConfigured({ PARTNER_ADS_KEY: KEY })).toBe(true);
  });
});

describe("verifyPartnerKey", () => {
  const env = { PARTNER_ADS_KEY: KEY, PARTNER_ADS_LABEL: "rick" };
  it("正確金鑰 → 通過並帶回標籤（稽核用）", () => {
    expect(verifyPartnerKey(reqWith(`Bearer ${KEY}`), env)).toEqual({ ok: true, label: "rick" });
  });
  it("大小寫不同的 Bearer 也接受", () => {
    expect(verifyPartnerKey(reqWith(`bearer ${KEY}`), env).ok).toBe(true);
  });
  it("金鑰錯、缺標頭、只有 Bearer → 都擋下", () => {
    expect(verifyPartnerKey(reqWith(`Bearer ${"x".repeat(32)}`), env).ok).toBe(false);
    expect(verifyPartnerKey(reqWith(""), env).ok).toBe(false);
    expect(verifyPartnerKey(reqWith("Bearer "), env).ok).toBe(false);
  });
  it("env 未設 → 一律拒絕，不會變成無條件放行", () => {
    expect(verifyPartnerKey(reqWith(`Bearer ${KEY}`), {})).toEqual({ ok: false, error: "not_configured" });
  });
  it("長度不同的金鑰不會丟例外", () => {
    expect(() => verifyPartnerKey(reqWith("Bearer abc"), env)).not.toThrow();
  });
});
