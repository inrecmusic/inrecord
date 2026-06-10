import { describe, it, expect } from "vitest";
import { needsFulfillment, needsInvoice } from "./order-fulfillment.js";

describe("needsFulfillment（優惠券累計／寄信去重）", () => {
  it("首次處理（fulfilled_at 為空）需要履約", () => {
    expect(needsFulfillment({ id: "o1", fulfilled_at: null })).toBe(true);
    expect(needsFulfillment({ id: "o1" })).toBe(true);
  });

  it("已履約（fulfilled_at 有值）不再重複", () => {
    expect(needsFulfillment({ id: "o1", fulfilled_at: "2026-06-10T00:00:00Z" })).toBe(false);
  });

  it("沒有訂單 id 不履約", () => {
    expect(needsFulfillment(null)).toBe(false);
    expect(needsFulfillment({})).toBe(false);
  });
});

describe("needsInvoice（開發票去重，可重試）", () => {
  it("尚未開票需要開立", () => {
    expect(needsInvoice({ id: "o1", invoice_no: null })).toBe(true);
  });

  it("已有發票號碼不再開立", () => {
    expect(needsInvoice({ id: "o1", invoice_no: "AB12345678" })).toBe(false);
  });
});

describe("迴歸：開票連續失敗不應重複累計優惠券／重複寄信", () => {
  it("已履約但開票仍失敗的訂單：不再履約、但仍會重試開票", () => {
    // 第一次已寫入 fulfilled_at（優惠券已 +1、信已寄），但發票失敗 invoice_no 仍為 null
    const order = { id: "o1", fulfilled_at: "2026-06-10T00:00:00Z", invoice_no: null, invoice_error: "amego_9000xxx" };
    expect(needsFulfillment(order)).toBe(false); // 不會再 +1、不再寄信
    expect(needsInvoice(order)).toBe(true);      // 但發票可重試
  });
});
