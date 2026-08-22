import { describe, it, expect } from "vitest";
import { isProfileCoreComplete, validateProfile, mergePrefill } from "./student-profile.js";

describe("isProfileCoreComplete", () => {
  it("核心三欄齊 → true", () => {
    expect(isProfileCoreComplete({ real_name: "王小明", phone: "0912345678", level: "none" })).toBe(true);
  });
  it("缺任一核心 → false", () => {
    expect(isProfileCoreComplete({ real_name: "", phone: "0912345678", level: "none" })).toBe(false);
    expect(isProfileCoreComplete({ real_name: "A", phone: "", level: "none" })).toBe(false);
    expect(isProfileCoreComplete({ real_name: "A", phone: "0912345678", level: "bad" })).toBe(false);
    expect(isProfileCoreComplete(null)).toBe(false);
  });
});

describe("validateProfile", () => {
  it("核心齊＋選配空 → ok，選配為 null", () => {
    const r = validateProfile({ real_name: " 王小明 ", phone: "0912345678", level: "self" });
    expect(r.ok).toBe(true);
    expect(r.value).toMatchObject({ real_name: "王小明", phone: "0912345678", level: "self",
      goal: null, source: null, equipment: null, age_group: null, gender: null });
  });
  it("手機格式錯 → invalid_phone", () => {
    expect(validateProfile({ real_name: "A", phone: "12345", level: "none" })).toEqual({ ok: false, error: "invalid_phone" });
  });
  it("缺姓名 → missing_real_name；level 非法 → invalid_level", () => {
    expect(validateProfile({ real_name: "", phone: "0912345678", level: "none" }).error).toBe("missing_real_name");
    expect(validateProfile({ real_name: "A", phone: "0912345678", level: "x" }).error).toBe("invalid_level");
  });
  it("選配給非白名單值 → invalid_option", () => {
    expect(validateProfile({ real_name: "A", phone: "0912345678", level: "none", gender: "xx" }).error).toBe("invalid_option");
  });
  it("goal 超過 500 字截斷", () => {
    const r = validateProfile({ real_name: "A", phone: "0912345678", level: "none", goal: "x".repeat(600) });
    expect(r.value.goal.length).toBe(500);
  });
});

describe("mergePrefill", () => {
  it("profile 空 → 用訂單 buyer_name/phone 補", () => {
    expect(mergePrefill(null, { buyer_name: "陳大文", phone: "0922333444" }))
      .toMatchObject({ real_name: "陳大文", phone: "0922333444", level: "" });
  });
  it("profile 有值 → 不被訂單覆寫", () => {
    expect(mergePrefill({ real_name: "原本", phone: "0911111111" }, { buyer_name: "訂單", phone: "0999" }))
      .toMatchObject({ real_name: "原本", phone: "0911111111" });
  });
});
