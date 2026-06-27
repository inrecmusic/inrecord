import { describe, it, expect } from "vitest";
import { buildSalesTrend, buildPayDistribution } from "./dashboard.js";

// 用本地時間建構，避免 UTC/本地 時區換算造成日界誤差
const now = new Date(2026, 5, 27, 12, 0, 0); // 2026-06-27 12:00 本地
const at = (y, mo, d, h = 12) => new Date(y, mo, d, h, 0, 0).toISOString();
const sum = (arr, k) => arr.reduce((s, x) => s + x[k], 0);

describe("buildSalesTrend (month)", () => {
  const orders = [
    { status: "paid", amount: 2500, created_at: at(2026, 5, 27) },     // 今天
    { status: "paid", amount: 2500, created_at: at(2026, 5, 27, 9) },  // 今天
    { status: "paid", amount: 1000, created_at: at(2026, 5, 22) },     // 5 天前
    { status: "paid", amount: 9999, created_at: at(2026, 4, 1) },      // 區間外（~57 天前）
    { status: "pending", amount: 5000, created_at: at(2026, 5, 27) },  // 非 paid → 排除
  ];

  it("分 30 桶、最後一桶為今天", () => {
    const t = buildSalesTrend(orders, "month", now);
    expect(t).toHaveLength(30);
    expect(t[29].orders).toBe(2);
    expect(t[29].revenue).toBe(5000);
  });

  it("較早的訂單落在正確的較早桶", () => {
    const t = buildSalesTrend(orders, "month", now);
    expect(t[24].orders).toBe(1);   // 5 天前
    expect(t[24].revenue).toBe(1000);
  });

  it("只計 paid、排除區間外，總和正確", () => {
    const t = buildSalesTrend(orders, "month", now);
    expect(sum(t, "orders")).toBe(3);
    expect(sum(t, "revenue")).toBe(6000);
  });

  it("空輸入不崩潰、回滿桶 0", () => {
    const t = buildSalesTrend([], "month", now);
    expect(t).toHaveLength(30);
    expect(sum(t, "orders")).toBe(0);
  });

  it("day/week/year 桶數正確", () => {
    expect(buildSalesTrend([], "day", now)).toHaveLength(24);
    expect(buildSalesTrend([], "week", now)).toHaveLength(7);
    expect(buildSalesTrend([], "year", now)).toHaveLength(12);
  });
});

describe("buildPayDistribution", () => {
  const orders = [
    { status: "paid", amount: 2500, source: "concert" },
    { status: "paid", amount: 2500, source: "concert" },
    { status: "paid", amount: 3800, pay_type: "Credit" },
    { status: "paid", amount: 1000, source: "wordpress" },
    { status: "pending", amount: 9, source: "concert" }, // 排除
  ];

  it("依筆數遞減分組；pay_type 優先、否則退回來源標籤", () => {
    const d = buildPayDistribution(orders);
    expect(d).toHaveLength(3);
    expect(d[0]).toEqual({ label: "演奏會線上", count: 2, amount: 5000 });
    expect(d[1]).toEqual({ label: "信用卡", count: 1, amount: 3800 }); // 同筆數時金額大的在前
    expect(d[2]).toEqual({ label: "碩樂現場", count: 1, amount: 1000 });
  });

  it("無 pay_type 也無已知來源 → 未知", () => {
    const d = buildPayDistribution([{ status: "paid", amount: 100 }]);
    expect(d).toEqual([{ label: "未知", count: 1, amount: 100 }]);
  });

  it("空 / 無 paid → 空陣列", () => {
    expect(buildPayDistribution([])).toEqual([]);
    expect(buildPayDistribution([{ status: "pending", amount: 1 }])).toEqual([]);
  });
});
