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

// 結構化輸出（json_schema）的限制：所有 object 節點都要 additionalProperties:false，不能有「自由 key 的物件」。
function objectNodes(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) { node.forEach((n) => objectNodes(n, out)); return out; }
  if (node.type === "object") out.push(node);
  for (const v of Object.values(node)) objectNodes(v, out);
  return out;
}

describe("REPORT_SCHEMA 符合結構化輸出限制", () => {
  it("每個 object 節點都是 additionalProperties:false 且 required 齊", () => {
    const nodes = objectNodes(REPORT_SCHEMA);
    expect(nodes.length).toBeGreaterThanOrEqual(4);
    for (const n of nodes) {
      expect(n.additionalProperties).toBe(false);
      expect(n.required).toEqual(Object.keys(n.properties || {}));
    }
  });
  it("metrics 是 { name, value } 的陣列（不是自由 key 物件）", () => {
    expect(REPORT_SCHEMA.properties.metrics.type).toBe("array");
    expect(REPORT_SCHEMA.properties.metrics.items.required).toEqual(["name", "value"]);
  });
});

describe("sanitizeReport metrics", () => {
  it("陣列 → 物件；沒名字、空值、物件值丟掉；舊的物件格式照收", () => {
    const r = sanitizeReport({ metrics: [{ name: "本週營收", value: "12000" }, { name: "", value: "x" }, { name: "空", value: null }, { name: "巢狀", value: { a: 1 } }, { name: "上週營收", value: 9000 }] });
    expect(r.metrics).toEqual({ "本週營收": "12000", "上週營收": 9000 });
    expect(sanitizeReport({ metrics: { paid: 2 } }).metrics).toEqual({ paid: 2 });
    expect(sanitizeReport({ metrics: "nope" }).metrics).toEqual({});
  });
});
