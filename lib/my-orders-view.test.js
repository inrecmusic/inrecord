import { describe, it, expect } from "vitest";
import { statusLabel, invoiceText, sortOrdersDesc } from "./my-orders-view.js";

describe("statusLabel", () => {
  it("已知狀態中文化", () => {
    expect(statusLabel("paid")).toBe("已付款");
    expect(statusLabel("pending")).toBe("待付款");
    expect(statusLabel("refunded")).toBe("已退款");
    expect(statusLabel("expired")).toBe("已逾期");
    expect(statusLabel("failed")).toBe("付款失敗");
  });
  it("未知/空 → 破折號", () => {
    expect(statusLabel("weird")).toBe("—");
    expect(statusLabel("")).toBe("—");
    expect(statusLabel(undefined)).toBe("—");
  });
});

describe("invoiceText", () => {
  it("有發票號碼", () => {
    expect(invoiceText("AB12345678")).toBe("發票號碼 AB12345678（已寄至你的信箱）");
  });
  it("無發票", () => {
    expect(invoiceText(null)).toBe("發票尚未開立");
    expect(invoiceText("")).toBe("發票尚未開立");
  });
});

describe("sortOrdersDesc", () => {
  it("依 created_at 新→舊", () => {
    const list = [
      { mer_trade_no: "a", created_at: "2026-01-01T00:00:00Z" },
      { mer_trade_no: "b", created_at: "2026-03-01T00:00:00Z" },
    ];
    expect(sortOrdersDesc(list).map(o => o.mer_trade_no)).toEqual(["b", "a"]);
  });
  it("不改動輸入", () => {
    const list = [
      { mer_trade_no: "a", created_at: "2026-01-01T00:00:00Z" },
      { mer_trade_no: "b", created_at: "2026-03-01T00:00:00Z" },
    ];
    sortOrdersDesc(list);
    expect(list.map(o => o.mer_trade_no)).toEqual(["a", "b"]);
  });
  it("nullish → 空陣列", () => {
    expect(sortOrdersDesc(null)).toEqual([]);
    expect(sortOrdersDesc([])).toEqual([]);
  });
});
