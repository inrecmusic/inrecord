import { describe, it, expect } from "vitest";
import { validateDisplayName } from "./account.js";

describe("validateDisplayName", () => {
  it("正常名稱：去頭尾空白後回傳 ok", () => {
    expect(validateDisplayName("  小明  ")).toEqual({ ok: true, value: "小明" });
    expect(validateDisplayName("Rick Chang")).toEqual({ ok: true, value: "Rick Chang" });
  });

  it("剛好 20 字：通過", () => {
    const name = "一".repeat(20);
    expect(validateDisplayName(name)).toEqual({ ok: true, value: name });
  });

  it("空字串 / 純空白 / 非字串：回錯誤", () => {
    expect(validateDisplayName("")).toEqual({ ok: false, error: "請輸入顯示名稱" });
    expect(validateDisplayName("   ")).toEqual({ ok: false, error: "請輸入顯示名稱" });
    expect(validateDisplayName(undefined)).toEqual({ ok: false, error: "請輸入顯示名稱" });
    expect(validateDisplayName(null)).toEqual({ ok: false, error: "請輸入顯示名稱" });
  });

  it("超過 20 字（去空白後）：回錯誤", () => {
    expect(validateDisplayName("一".repeat(21))).toEqual({ ok: false, error: "顯示名稱請勿超過 20 字" });
  });
});
