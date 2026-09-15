import { describe, it, expect, beforeEach } from "vitest";
import { signGrantToken, verifyGrantToken, signReturnCookie, verifyReturnCookie, GRANT_TTL_MS } from "./grant-token.js";

beforeEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret-key-abc";
});

describe("signGrantToken", () => {
  it("格式為 `到期毫秒.HMAC`；同一時間點簽同一筆訂單結果相同", () => {
    const now = 1757900000000;
    const t1 = signGrantToken("INREC1782785571389", now);
    const t2 = signGrantToken("INREC1782785571389", now);
    expect(t1).toBe(t2);
    expect(t1).toMatch(/^\d+\.[0-9a-f]{64}$/);
    expect(Number(t1.split(".")[0])).toBe(now + GRANT_TTL_MS);
  });

  it("不同 MerTradeNo 產生不同 token", () => {
    const now = 1757900000000;
    expect(signGrantToken("INREC1", now)).not.toBe(signGrantToken("INREC2", now));
  });

  it("不同 SECRET 對同一 MerTradeNo 產生不同 token", () => {
    const now = 1757900000000;
    const t1 = signGrantToken("INREC1", now);
    process.env.SUPABASE_SERVICE_ROLE_KEY = "different-secret";
    expect(signGrantToken("INREC1", now)).not.toBe(t1);
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

  it("過期的 token 擋下（開著成功頁一天後才送出不算數）", () => {
    const now = 1757900000000;
    const token = signGrantToken("INREC1", now);
    expect(verifyGrantToken("INREC1", token, now + GRANT_TTL_MS - 1)).toBe(true);
    expect(verifyGrantToken("INREC1", token, now + GRANT_TTL_MS + 1)).toBe(false);
  });

  it("把到期時間往後改就驗不過（exp 本身在簽章範圍內）", () => {
    const now = 1757900000000;
    const [, mac] = signGrantToken("INREC1", now).split(".");
    expect(verifyGrantToken("INREC1", `${now + 86400000}.${mac}`, now)).toBe(false);
  });
});

// 付款導回憑證：只有 /api/payuni/return 驗過 PAYUNi 簽章後才會種下，/success 靠它決定是否顯示表單
describe("signReturnCookie / verifyReturnCookie", () => {
  it("簽出來的值驗得過，換一筆訂單就驗不過", () => {
    const now = 1757900000000;
    const v = signReturnCookie("INREC1", now);
    expect(verifyReturnCookie("INREC1", v, now)).toBe(true);
    expect(verifyReturnCookie("INREC2", v, now)).toBe(false);
  });

  it("兩種憑證互不通用（cookie 當 grantToken 用、或反過來，都擋下）", () => {
    const now = 1757900000000;
    expect(verifyGrantToken("INREC1", signReturnCookie("INREC1", now), now)).toBe(false);
    expect(verifyReturnCookie("INREC1", signGrantToken("INREC1", now), now)).toBe(false);
  });

  it("缺值／過期擋下", () => {
    const now = 1757900000000;
    expect(verifyReturnCookie("INREC1", undefined, now)).toBe(false);
    expect(verifyReturnCookie("INREC1", signReturnCookie("INREC1", now), now + 31 * 60 * 1000)).toBe(false);
  });
});
