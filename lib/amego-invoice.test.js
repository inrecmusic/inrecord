import { describe, it, expect } from "vitest";
import { parseAmegoResult } from "./amego-invoice.js";

describe("parseAmegoResult", () => {
  it("code=0 且有 invoice_number → success，發票號取自 invoice_number（非 msg）", () => {
    const r = parseAmegoResult({ code: "0", msg: "", invoice_number: "AB12345678", invoice_time: "t", random_number: "1234", barcode: "bc" });
    expect(r).toEqual({ success: true, invoiceNo: "AB12345678", invoiceTime: "t", randomCode: "1234", barcode: "bc" });
  });

  it("code=0（數字）也算成功", () => {
    expect(parseAmegoResult({ code: 0, invoice_number: "X1" }).success).toBe(true);
  });

  it("code=0 但沒有 invoice_number → 視為失敗（不把 msg 當發票號）", () => {
    const r = parseAmegoResult({ code: "0", msg: "something" });
    expect(r.success).toBe(false);
    expect(r.invoiceNo).toBeUndefined();
  });

  it("code 非 0 → 失敗，error 取 msg", () => {
    const r = parseAmegoResult({ code: "100", msg: "統編錯誤" });
    expect(r).toEqual({ success: false, error: "統編錯誤", code: "100" });
  });
});
