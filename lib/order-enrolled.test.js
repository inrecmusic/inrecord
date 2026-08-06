import { describe, it, expect } from "vitest";
import { markEnrolled, pickUngrantedPayuni } from "./order-enrolled.js";

describe("markEnrolled（用 enrollments email 標記訂單開通狀態）", () => {
  it("email 命中 enrollments → enrolled true（大小寫/空白不敏感）", () => {
    const orders = [{ id: "1", email: "A@x.com" }, { id: "2", email: "b@x.com" }];
    const out = markEnrolled(orders, [" a@x.com "]);
    expect(out[0].enrolled).toBe(true);
    expect(out[1].enrolled).toBe(false);
  });

  it("空輸入安全", () => {
    expect(markEnrolled(null, null)).toEqual([]);
    expect(markEnrolled([{ id: "1", email: "x@x.com" }], null)[0].enrolled).toBe(false);
  });
});

describe("pickUngrantedPayuni（要開通的官網訂單）", () => {
  const orders = [
    { id: "1", email: "a@x.com", source: "payuni", status: "paid" },   // 未開通 → 要
    { id: "2", email: "b@x.com", source: "payuni", status: "paid" },   // 已開通 → 不要
    { id: "3", email: "c@x.com", source: "payuni", status: "pending" },// 未付款 → 不要
    { id: "4", email: "d@x.com", source: "concert", status: "paid" },  // 非官網 → 不要
  ];
  it("只挑 payuni + paid + 未開通", () => {
    const out = pickUngrantedPayuni(orders, ["b@x.com"]);
    expect(out.map(o => o.id)).toEqual(["1"]);
  });
});
