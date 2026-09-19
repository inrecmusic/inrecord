import { describe, it, expect, vi, afterEach } from "vitest";
import { classifyEvent, recordPaymentEvent, extractCardInfo, paymentKind, extractTransferInfo, bankLabel } from "./payment-events";
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

describe("extractCardInfo（信用卡明細：分期／末四碼／授權碼）", () => {
  it("標準命名抓得到三項，並記下實際命中的原始 key", () => {
    expect(extractCardInfo({ MerTradeNo: "INREC1", Installment: "3", Card4No: "4242", AuthCode: "012345" })).toMatchObject({
      installment: 3, installmentState: "n", last4: "4242", authCode: "012345",
      matchedKeys: { installment: "Installment", last4: "Card4No", authCode: "AuthCode" },
    });
  });

  it("key 的大小寫／底線／連字號一律忽略", () => {
    const r = extractCardInfo({ INSTALLMENT_PERIOD: "6", "card-last-4": "1234", approval_code: "AB12" });
    expect(r).toMatchObject({ installment: 6, last4: "1234", authCode: "AB12" });
    expect(r.matchedKeys).toEqual({ installment: "INSTALLMENT_PERIOD", last4: "card-last-4", authCode: "approval_code" });
  });

  it("其他候選名（inst／last4／approvalcode）也抓得到；太泛的 period／auth 刻意不收", () => {
    expect(extractCardInfo({ Inst: 12 }).installment).toBe(12);
    expect(extractCardInfo({ last4: "9999" }).last4).toBe("9999");
    expect(extractCardInfo({ ApprovalCode: "XYZ789" }).authCode).toBe("XYZ789");
  });

  it("期數正規化：\"3\"／3／\"03\" → 3", () => {
    expect(extractCardInfo({ Installment: "3" }).installment).toBe(3);
    expect(extractCardInfo({ Installment: 3 }).installment).toBe(3);
    expect(extractCardInfo({ Installment: "03" }).installment).toBe(3);
  });

  it("0 期＝一次付清 → installmentState 為 none，matchedKeys 仍記得欄位（分得出「找不到欄位」）", () => {
    const r = extractCardInfo({ Installment: "0" });
    expect(r.installment).toBeNull();
    expect(r.matchedKeys.installment).toBe("Installment");
    expect(extractCardInfo({ Installment: 0 }).matchedKeys.installment).toBe("Installment");
  });

  it("空字串／找不到 → installment 與 matchedKeys 皆為 null（絕不可當成一次付清）", () => {
    expect(extractCardInfo({ Installment: "" })).toMatchObject({ installment: null, installmentState: "missing", matchedKeys: { installment: null } });
    expect(extractCardInfo({ TradeStatus: "1", TradeAmt: "3999" })).toEqual({
      installment: null, installmentState: "missing", installmentRaw: null, last4: null, authCode: null,
      firstAmt: null, eachAmt: null,
      matchedKeys: { installment: null, last4: null, authCode: null },
    });
  });

  it("候選名有優先序：明確的 Installment 勝過含糊的 Period", () => {
    const r = extractCardInfo({ Period: "24", Installment: "6" });
    expect(r.installment).toBe(6);
    expect(r.matchedKeys.installment).toBe("Installment");
  });

  it("遮罩卡號取最後四碼", () => {
    expect(extractCardInfo({ CardNo4: "424242******4242" }).last4).toBe("4242");
    expect(extractCardInfo({ Card4: "4242-42**-****-1234" }).last4).toBe("1234");
  });

  it("巢狀 raw 也找得到，matchedKeys 用 a.b 路徑表示", () => {
    const r = extractCardInfo({ Result: { Credit: { InstallmentPeriod: "6", Card4No: "8888" } } });
    expect(r).toMatchObject({ installment: 6, last4: "8888" });
    expect(r.matchedKeys.installment).toBe("Result.Credit.InstallmentPeriod");
    expect(r.matchedKeys.last4).toBe("Result.Credit.Card4No");
  });

  it("同名時淺層優先", () => {
    const r = extractCardInfo({ Installment: "3", Result: { Installment: "12" } });
    expect(r.installment).toBe(3);
    expect(r.matchedKeys.installment).toBe("Installment");
  });

  it("非物件輸入（null／字串／陣列／undefined）安全回空值，不拋出", () => {
    const blank = { installment: null, installmentState: "missing", installmentRaw: null, last4: null, authCode: null, firstAmt: null, eachAmt: null, matchedKeys: { installment: null, last4: null, authCode: null } };
    expect(extractCardInfo(null)).toEqual(blank);
    expect(extractCardInfo(undefined)).toEqual(blank);
    expect(extractCardInfo("Installment=3")).toEqual(blank);
    expect(extractCardInfo([{ Installment: "3" }])).toEqual(blank);
  });

  it("循環參照不會無限迴圈", () => {
    const raw = { Installment: "3" };
    raw.self = raw;
    expect(extractCardInfo(raw).installment).toBe(3);
  });
});


// 覆驗抓到的三個 major，釘住：看不懂的值不可變成「一次付清」；荒謬數字要擋；同筆訂單失敗嘗試不可混入
describe("extractCardInfo：三態與合理區間", () => {
  it('"0"／0／"1" → none（一次付清；真單核對 PAYUNi CardInst=1 即一次付清）；"3"／"03"／3 → n', () => {
    expect(extractCardInfo({ Installment: "0" })).toMatchObject({ installmentState: "none", installment: null });
    expect(extractCardInfo({ Installment: 0 })).toMatchObject({ installmentState: "none" });
    expect(extractCardInfo({ CardInst: "1", FirstAmt: "3999", EachAmt: "0" })).toMatchObject({ installmentState: "none", installment: null, firstAmt: 3999, eachAmt: null });
    expect(extractCardInfo({ CardInst: "3", FirstAmt: "1333", EachAmt: "1333" })).toMatchObject({ installmentState: "n", installment: 3, firstAmt: 1333, eachAmt: 1333 });
    expect(extractCardInfo({ Installment: "03" })).toMatchObject({ installmentState: "n", installment: 3 });
  });
  it('"null"／"NA"／"3期(每期1000)"／日期 → unparsable，並保留原值供人核對（絕不是一次付清）', () => {
    for (const v of ["null", "NA", "無", "3期(每期1000)", "20260914", "99"]) {
      const r = extractCardInfo({ Installment: v });
      expect(r.installmentState, v).toBe("unparsable");
      expect(r.installment, v).toBeNull();
      expect(r.installmentRaw, v).toBe(v);
      expect(r.matchedKeys.installment).toBe("Installment");
    }
  });
  it("太泛的 Period／Auth 不再被當成分期或授權碼", () => {
    expect(extractCardInfo({ Period: "20260914" }).installmentState).toBe("missing");
    expect(extractCardInfo({ Auth: "x" }).authCode).toBeNull();
  });
  it("PAYUNi 命名習慣的 CardInst 抓得到", () => {
    expect(extractCardInfo({ CardInst: "6" })).toMatchObject({ installmentState: "n", installment: 6 });
  });
});

// ATM／超商回呼沒有卡片欄位，後台不該顯示成「找不到分期欄位」那種像壞掉的訊息
describe("paymentKind / extractTransferInfo（非信用卡付款）", () => {
  const paid = { kind: "paid", trade_status: 1, raw: {
    PaymentType: "2", Message: "ATM轉帳付款成功", PayNo: "2206092606339380",
    PayBank: "013", Account5No: "03509", PayTime: "2026-09-19 19:58:46", TradeAmt: "4299" } };
  const issued = { kind: "code_issued", trade_status: 0, raw: {
    PaymentType: "2", Message: "ATM轉帳取號成功", PayNo: "2206092606339380",
    BankType: "013", ExpireDate: "2026-09-26 23:59:59" } };

  it("PaymentType=2 判為 ATM", () => {
    expect(paymentKind(paid.raw)).toBe("atm");
    expect(paymentKind({ PaymentType: "1" })).toBe("credit");
  });

  it("代碼認不出時退回看 Message 的中文", () => {
    expect(paymentKind({ Message: "ATM轉帳付款成功" })).toBe("atm");
    expect(paymentKind({ Message: "超商代碼繳費成功" })).toBe("cvs");
    expect(paymentKind({})).toBe("unknown");
  });

  it("繳費期限在取號那筆、繳款資訊在付款成功那筆，兩邊都要取到", () => {
    const t = extractTransferInfo([paid, issued]);
    expect(t).toMatchObject({
      kind: "atm", payNo: "2206092606339380", fromAccount5: "03509",
      paidAt: "2026-09-19 19:58:46", expireAt: "2026-09-26 23:59:59",
    });
    expect(t.bank).toContain("013");
  });

  it("銀行代碼查得到就附名稱，查不到只顯示代碼，不亂猜", () => {
    expect(bankLabel("013")).toBe("國泰世華（013）");
    expect(bankLabel("999")).toBe("999");
    expect(bankLabel("")).toBe(null);
  });

  it("只有取號還沒付款 → 繳費時間為空，不會亂填", () => {
    const t = extractTransferInfo([issued]);
    expect(t.paidAt).toBe(null);
    expect(t.expireAt).toBe("2026-09-26 23:59:59");
  });

  it("空陣列不丟例外", () => {
    expect(() => extractTransferInfo([])).not.toThrow();
    expect(extractTransferInfo([]).kind).toBe("unknown");
  });
});
