import { describe, it, expect } from "vitest";
import { ADMIN_PAGES, CORE_KEYS, REPORT_SCHEMA, sanitizeReport, sanitizeCore, coreRows, formatCoreValue } from "./schema.js";

describe("schema／sanitizeReport", () => {
  it("白名單含後台既有 nav id；schema 為 object 且 required 齊", () => {
    for (const id of ["dashboard", "orders", "students", "newsletter", "coupons", "courses", "ads", "sale", "announcements", "ops"]) expect(ADMIN_PAGES).toContain(id);
    expect(REPORT_SCHEMA.type).toBe("object");
    expect(REPORT_SCHEMA.required).toEqual(["headline", "highlights", "risks", "suggestions", "metrics"]);
    expect(REPORT_SCHEMA.additionalProperties).toBe(false);
    // 精簡版：建議只有「做什麼」＋後台頁，沒有 why
    expect(REPORT_SCHEMA.properties.suggestions.items.required).toEqual(["title", "admin_path"]);
  });
  it("丟掉 admin_path 不在白名單的建議、裁 highlights／suggestions 到 3、風險只留 high、缺欄位補空", () => {
    const r = sanitizeReport({
      headline: "h",
      highlights: ["1", "2", "3", "4", "5", "6"],
      risks: [{ level: "critical", text: "x" }, { level: "low", text: "y" }, { level: "medium", text: "m" }, { level: "high", text: "真的會掉錢" }, { level: "high", text: "  " }],
      suggestions: [{ title: "a", why: "w", admin_path: "orders" }, { title: "b", why: "w", admin_path: "http://evil" }, { title: "c", admin_path: "ads" }, { title: "d", admin_path: "sale" }, { title: "e", admin_path: "coupons" }],
    });
    expect(r.highlights).toHaveLength(3);
    expect(r.risks).toEqual([{ level: "high", text: "真的會掉錢" }]);
    expect(r.suggestions).toEqual([{ title: "a", admin_path: "orders" }, { title: "c", admin_path: "ads" }, { title: "d", admin_path: "sale" }]);
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
  it("metrics 是 { name, value } 的陣列（不是自由 key 物件）；core 不在模型 schema 裡（由程式附上）", () => {
    expect(REPORT_SCHEMA.properties.metrics.type).toBe("array");
    expect(REPORT_SCHEMA.properties.metrics.items.required).toEqual(["name", "value"]);
    expect(REPORT_SCHEMA.properties.core).toBeUndefined();
  });
});

describe("sanitizeReport metrics", () => {
  it("陣列 → 物件；沒名字、空值、物件值丟掉；最多 12 筆；舊的物件格式照收", () => {
    const r = sanitizeReport({ metrics: [{ name: "本週營收", value: "12000" }, { name: "", value: "x" }, { name: "空", value: null }, { name: "巢狀", value: { a: 1 } }, { name: "上週營收", value: 9000 }] });
    expect(r.metrics).toEqual({ "本週營收": "12000", "上週營收": 9000 });
    expect(sanitizeReport({ metrics: { paid: 2 } }).metrics).toEqual({ paid: 2 });
    expect(sanitizeReport({ metrics: "nope" }).metrics).toEqual({});
    const many = sanitizeReport({ metrics: Array.from({ length: 20 }, (_, i) => ({ name: `m${i}`, value: String(i) })) });
    expect(Object.keys(many.metrics)).toHaveLength(12);
  });
});

describe("core 六指標", () => {
  it("sanitizeCore：固定六個 key，各 { this_week, last_week }，非數字一律 null", () => {
    const c = sanitizeCore({ revenue: { this_week: 0, last_week: 22195 }, ad_spend: { this_week: "813", last_week: null }, junk: { this_week: 1 } });
    expect(Object.keys(c)).toEqual(CORE_KEYS);
    expect(c.revenue).toEqual({ this_week: 0, last_week: 22195 });
    expect(c.ad_spend).toEqual({ this_week: null, last_week: null });
    expect(c.paid_orders).toEqual({ this_week: null, last_week: null });
    expect(sanitizeCore(undefined).newsletter_sent).toEqual({ this_week: null, last_week: null });
  });
  it("formatCoreValue／coreRows：金額加 NT$ 與千分位、null 畫「—」；舊報告沒 core 回空陣列", () => {
    expect(formatCoreValue("revenue", 22195)).toBe("NT$22,195");
    expect(formatCoreValue("ad_spend", 813.4)).toBe("NT$813");
    expect(formatCoreValue("paid_orders", 5)).toBe("5");
    expect(formatCoreValue("active_students", null)).toBe("—");
    const rows = coreRows({ core: { revenue: { this_week: 0, last_week: 22195 }, paid_orders: { this_week: 0, last_week: 5 } } });
    expect(rows).toHaveLength(6);
    expect(rows[0]).toEqual({ key: "revenue", label: "營收", now: "NT$0", prev: "NT$22,195" });
    expect(rows[1]).toEqual({ key: "paid_orders", label: "已付款訂單", now: "0", prev: "5" });
    expect(rows[4]).toEqual({ key: "ad_spend", label: "廣告花費", now: "—", prev: "—" });
    expect(coreRows({ headline: "舊的" })).toEqual([]);
    expect(coreRows(null)).toEqual([]);
  });
});
