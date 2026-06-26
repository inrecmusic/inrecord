import { describe, it, expect } from "vitest";
import { safeNextPath } from "./safe-redirect.js";

describe("safeNextPath", () => {
  it("放行站內相對路徑（保留 query / hash）", () => {
    expect(safeNextPath("/classroom")).toBe("/classroom");
    expect(safeNextPath("/classroom?tab=1#x")).toBe("/classroom?tab=1#x");
  });

  it("擋 protocol-relative //evil.com", () => {
    expect(safeNextPath("//evil.com")).toBe("/classroom");
  });

  it("擋絕對網址（http/https/javascript）", () => {
    expect(safeNextPath("https://evil.com")).toBe("/classroom");
    expect(safeNextPath("http://evil.com")).toBe("/classroom");
    expect(safeNextPath("javascript:alert(1)")).toBe("/classroom");
  });

  it("擋反斜線變體 /\\evil.com（部分瀏覽器當成 //）", () => {
    expect(safeNextPath("/\\evil.com")).toBe("/classroom");
  });

  it("非相對路徑 / 空值 → fallback", () => {
    expect(safeNextPath("relative/path")).toBe("/classroom");
    expect(safeNextPath("")).toBe("/classroom");
    expect(safeNextPath(null)).toBe("/classroom");
    expect(safeNextPath(undefined)).toBe("/classroom");
  });

  it("可自訂 fallback", () => {
    expect(safeNextPath("//evil.com", "/login")).toBe("/login");
  });
});
