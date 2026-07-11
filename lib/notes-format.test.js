import { describe, it, expect } from "vitest";
import { formatSeconds, sortNotes } from "./notes-format.js";

describe("formatSeconds", () => {
  it("小於一分鐘補零秒", () => {
    expect(formatSeconds(0)).toBe("0:00");
    expect(formatSeconds(5)).toBe("0:05");
  });
  it("分:秒", () => {
    expect(formatSeconds(65)).toBe("1:05");
    expect(formatSeconds(600)).toBe("10:00");
  });
  it("超過一小時顯示時:分:秒（分補零）", () => {
    expect(formatSeconds(3661)).toBe("1:01:01");
    expect(formatSeconds(3600)).toBe("1:00:00");
  });
  it("負數/NaN/小數 → 取下界或 0:00", () => {
    expect(formatSeconds(-5)).toBe("0:00");
    expect(formatSeconds(NaN)).toBe("0:00");
    expect(formatSeconds(65.9)).toBe("1:05");
  });
});

describe("sortNotes", () => {
  it("依 seconds 升冪", () => {
    const out = sortNotes([{ id: "b", seconds: 90 }, { id: "a", seconds: 10 }]);
    expect(out.map(n => n.id)).toEqual(["a", "b"]);
  });
  it("不改動輸入", () => {
    const input = [{ id: "b", seconds: 90 }, { id: "a", seconds: 10 }];
    sortNotes(input);
    expect(input.map(n => n.id)).toEqual(["b", "a"]);
  });
  it("nullish → 空陣列", () => {
    expect(sortNotes(null)).toEqual([]);
    expect(sortNotes([])).toEqual([]);
  });
});
