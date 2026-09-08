import { describe, it, expect } from "vitest";
import { ADMIN_PAGES, REPORT_SCHEMA, sanitizeReport } from "./schema.js";

describe("schema／sanitizeReport", () => {
  it("白名單含後台既有 nav id；schema 為 object 且 required 齊", () => {
    for (const id of ["dashboard", "orders", "students", "newsletter", "coupons", "courses", "ads", "sale", "announcements", "ops"]) expect(ADMIN_PAGES).toContain(id);
    expect(REPORT_SCHEMA.type).toBe("object");
    expect(REPORT_SCHEMA.required).toEqual(["headline", "highlights", "risks", "suggestions", "metrics"]);
    expect(REPORT_SCHEMA.additionalProperties).toBe(false);
  });
  it("丟掉 admin_path 不在白名單的建議、裁 highlights 到 5、risk level 非法改 medium、缺欄位補空", () => {
    const r = sanitizeReport({
      headline: "h",
      highlights: ["1", "2", "3", "4", "5", "6"],
      risks: [{ level: "critical", text: "x" }, { level: "low", text: "y" }],
      suggestions: [{ title: "a", why: "w", admin_path: "orders" }, { title: "b", why: "w", admin_path: "http://evil" }],
    });
    expect(r.highlights).toHaveLength(5);
    expect(r.risks[0].level).toBe("medium");
    expect(r.suggestions).toEqual([{ title: "a", why: "w", admin_path: "orders" }]);
    expect(r.metrics).toEqual({});
  });
});
