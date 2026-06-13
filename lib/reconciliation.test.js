import { describe, it, expect } from "vitest";
import { summarizeOrders } from "./reconciliation.js";

const catalog = { course: { price: 3800 }, bundle: { price: 3999 } };

describe("summarizeOrders", () => {
  it("混合狀態：paid/refunded/pending 金額與筆數正確，有效收款不含退款", () => {
    const orders = [
      { status: "paid", amount: 3800, pay_type: "信用卡", invoice_no: "AB1", plan: "course" },
      { status: "paid", amount: 3999, pay_type: "ATM", plan: "bundle" },
      { status: "refunded", amount: 3800, pay_type: "信用卡", plan: "course" },
      { status: "pending", amount: 3800, plan: "course" },
    ];
    const r = summarizeOrders(orders, catalog);
    expect(r.paid).toEqual({ count: 2, amount: 7799 });
    expect(r.refunded).toEqual({ count: 1, amount: 3800 });
    expect(r.pending.count).toBe(1);
  });

  it("byPayType：僅計 paid、依 pay_type 分組（null→未知）", () => {
    const orders = [
      { status: "paid", amount: 100, pay_type: "信用卡" },
      { status: "paid", amount: 200, pay_type: "信用卡" },
      { status: "paid", amount: 50 },
      { status: "refunded", amount: 999, pay_type: "信用卡" },
    ];
    const r = summarizeOrders(orders, catalog);
    expect(r.byPayType["信用卡"]).toEqual({ count: 2, amount: 300 });
    expect(r.byPayType["未知"]).toEqual({ count: 1, amount: 50 });
  });

  it("invoice：paid 中 issued/missing 計數", () => {
    const orders = [
      { status: "paid", amount: 1, invoice_no: "X" },
      { status: "paid", amount: 1 },
      { status: "paid", amount: 1, invoice_no: "" },
    ];
    const r = summarizeOrders(orders, catalog);
    expect(r.invoice).toEqual({ issued: 1, missing: 2 });
  });

  it("coupon：折抵 = 原價 − 實付（僅 paid 且有 coupon_code）", () => {
    const orders = [
      { status: "paid", amount: 3000, plan: "course", coupon_code: "SAVE800" },
      { status: "paid", amount: 3999, plan: "bundle" },
      { status: "refunded", amount: 1000, plan: "course", coupon_code: "X" },
    ];
    const r = summarizeOrders(orders, catalog);
    expect(r.coupon).toEqual({ count: 1, discount: 800 });
  });

  it("空陣列 → 全零", () => {
    const r = summarizeOrders([], catalog);
    expect(r.paid).toEqual({ count: 0, amount: 0 });
    expect(r.refunded).toEqual({ count: 0, amount: 0 });
    expect(r.pending.count).toBe(0);
    expect(r.byPayType).toEqual({});
    expect(r.invoice).toEqual({ issued: 0, missing: 0 });
    expect(r.coupon).toEqual({ count: 0, discount: 0 });
  });
});
