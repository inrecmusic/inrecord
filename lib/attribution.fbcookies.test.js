// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { readFbCookies } from "./attribution.js";

function clearCookies() {
  document.cookie.split(";").forEach((c) => {
    const k = c.split("=")[0].trim();
    if (k) document.cookie = k + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });
}

describe("readFbCookies (jsdom)", () => {
  beforeEach(clearCookies);

  it("讀 _fbp / _fbc", () => {
    document.cookie = "_fbp=fb.1.100.ABC";
    document.cookie = "_fbc=fb.1.100.CLK";
    expect(readFbCookies()).toEqual({ fbp: "fb.1.100.ABC", fbc: "fb.1.100.CLK" });
  });

  it("無 fb cookie 回空物件", () => {
    document.cookie = "other=1";
    expect(readFbCookies()).toEqual({});
  });

  it("壞的百分比編碼不拋、保留原值（絕不擋結帳）", () => {
    document.cookie = "_fbc=fb.1.100.%zz";
    expect(() => readFbCookies()).not.toThrow();
    expect(readFbCookies().fbc).toBe("fb.1.100.%zz");
  });
});
