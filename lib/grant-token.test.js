import { describe, it, expect, beforeEach } from "vitest";
import { signGrantToken, verifyGrantToken } from "./grant-token.js";

beforeEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret-key-abc";
});

describe("signGrantToken", () => {
  it("同一 MerTradeNo 穩定產出相同、固定長度(64 hex)的 token", () => {
    const t1 = signGrantToken("INREC1782785571389");
    const t2 = signGrantToken("INREC1782785571389");
    expect(t1).toBe(t2);
    expect(t1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("不同 MerTradeNo 產生不同 token", () => {
    expect(signGrantToken("INREC1")).not.toBe(signGrantToken("INREC2"));
  });

  it("不同 SECRET 對同一 MerTradeNo 產生不同 token", () => {
    const t1 = signGrantToken("INREC1");
    process.env.SUPABASE_SERVICE_ROLE_KEY = "different-secret";
    const t2 = signGrantToken("INREC1");
    expect(t1).not.toBe(t2);
  });
});

describe("verifyGrantToken", () => {
  it("正確 token 驗證通過", () => {
    const token = signGrantToken("INREC1782785571389");
    expect(verifyGrantToken("INREC1782785571389", token)).toBe(true);
  });

  it("竄改 token（末位翻轉）擋下", () => {
    const token = signGrantToken("INREC1782785571389");
    const lastChar = token.slice(-1);
    const tampered = token.slice(0, -1) + (lastChar === "0" ? "1" : "0");
    expect(verifyGrantToken("INREC1782785571389", tampered)).toBe(false);
  });

  it("拿別筆訂單的合法 token 冒用擋下（防橫向套用）", () => {
    const tokenForOther = signGrantToken("INREC_VICTIM_ORDER");
    expect(verifyGrantToken("INREC_ATTACKER_ORDER", tokenForOther)).toBe(false);
  });

  it("缺 token / 空字串 / 型別錯誤擋下", () => {
    expect(verifyGrantToken("INREC1", "")).toBe(false);
    expect(verifyGrantToken("INREC1", undefined)).toBe(false);
    expect(verifyGrantToken("INREC1", null)).toBe(false);
    expect(verifyGrantToken("INREC1", 12345)).toBe(false);
  });

  it("長度不同的 token 直接短路擋下（不會因不等長丟例外）", () => {
    expect(verifyGrantToken("INREC1782785571389", "abcd")).toBe(false);
    expect(() => verifyGrantToken("INREC1782785571389", "abcd")).not.toThrow();
  });
});
