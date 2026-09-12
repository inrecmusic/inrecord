import { describe, it, expect, vi, afterEach } from "vitest";
import { classifyEvent, recordPaymentEvent } from "./payment-events";
import { makeSupabaseMock } from "./test-helpers/supabase-mock";

const PAID = { MerTradeNo: "INREC1", TradeNo: "UNI1", TradeStatus: "1", TradeAmt: "3999", PaymentType: "1" };
// ATM 取號成功：PAYUNi 在下單後先送這包，帶銀行代碼／虛擬帳號／繳費期限（原本整包被丟掉）
const ATM_CODE = { MerTradeNo: "INREC2", TradeNo: "UNI2", TradeStatus: "0", PaymentType: "2", BankType: "812", PayNo: "9103522104123456", ExpireDate: "2026-09-15" };

describe("classifyEvent（回呼分類）", () => {
  it("TradeStatus=1 → paid，並取出索引欄位", () => {
    expect(classifyEvent(PAID)).toEqual({
      kind: "paid", merTradeNo: "INREC1", payuniTradeNo: "UNI1", tradeStatus: "1", payType: "1",
    });
  });

  it("ATM 取號（有虛擬帳號／繳費期限）→ code_issued", () => {
    const e = classifyEvent(ATM_CODE);
    expect(e.kind).toBe("code_issued");
    expect(e.merTradeNo).toBe("INREC2");
    expect(e.payType).toBe("2");
  });

  it("超商繳費代碼／條碼也算 code_issued（欄位名寬鬆判斷）", () => {
    expect(classifyEvent({ TradeStatus: "0", PayNo: "LLL123456789" }).kind).toBe("code_issued");
    expect(classifyEvent({ TradeStatus: "0", Barcode1: "0915", Barcode2: "X", Barcode3: "Y" }).kind).toBe("code_issued");
  });

  it("付款失敗等其餘情況 → other（寧可記成 other 也不要漏記）", () => {
    expect(classifyEvent({ MerTradeNo: "INREC3", TradeStatus: "2" }).kind).toBe("other");
    expect(classifyEvent({}).kind).toBe("other");
    expect(classifyEvent(null).kind).toBe("other");
  });

  it("空字串欄位視為沒有（不會誤判成 code_issued、也不會存空字串）", () => {
    const e = classifyEvent({ TradeStatus: "0", PayNo: "", BankType: "", MerTradeNo: "" });
    expect(e.kind).toBe("other");
    expect(e.merTradeNo).toBeNull();
  });

  it("PayType 是 PaymentType 的備援欄位名", () => {
    expect(classifyEvent({ TradeStatus: "1", PayType: "CREDIT" }).payType).toBe("CREDIT");
  });
});

describe("recordPaymentEvent（落地）", () => {
  afterEach(() => vi.restoreAllMocks());

  it("整包 params 原樣存進 raw，並填好分類欄位", async () => {
    const sb = makeSupabaseMock(() => ({ data: null, error: null }));
    expect(await recordPaymentEvent(sb, ATM_CODE)).toEqual({ ok: true });
    const ins = sb.calls.find((c) => c.table === "payment_events" && sb.has(c, "insert"));
    expect(sb.arg(ins, "insert")).toEqual({
      mer_trade_no: "INREC2", payuni_trade_no: "UNI2", trade_status: "0", pay_type: "2",
      kind: "code_issued", raw: ATM_CODE, // ← 虛擬帳號／繳費期限就靠這包留下來
    });
  });

  it("資料表不存在（SQL 未執行）→ 只記 log 並提示要跑哪支 SQL，不拋出", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const sb = makeSupabaseMock(() => ({ data: null, error: { code: "42P01", message: "relation does not exist" } }));
    await expect(recordPaymentEvent(sb, PAID)).resolves.toMatchObject({ ok: false });
    expect(spy.mock.calls[0].join(" ")).toContain("supabase-payment-events.sql");
  });

  it("insert 直接拋例外 → 吞掉不往上拋（notify 絕不可因此失敗）", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const sb = { from: () => { throw new Error("boom"); } };
    await expect(recordPaymentEvent(sb, PAID)).resolves.toMatchObject({ ok: false });
  });

  it("沒有 supabase（env 未設）→ 安靜略過", async () => {
    await expect(recordPaymentEvent(null, PAID)).resolves.toEqual({ ok: false, error: "no_supabase" });
  });
});
