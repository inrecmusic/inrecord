import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { aesEncrypt, makeHashInfo, parsePayuniCallback, payuniTrade } from "./payuni.js";

// AES-256-GCM：key 需 32 bytes、iv 16 bytes（與 PAYUNi sandbox 設定一致）
const KEY = "12345678901234567890123456789012"; // 32
const IV  = "1234567890123456";                 // 16

function buildCallback(params) {
  const qs = new URLSearchParams(params).toString();
  const encryptInfo = aesEncrypt(qs, KEY, IV);
  const hashInfo = makeHashInfo(encryptInfo, KEY, IV);
  return { encryptInfo, hashInfo };
}

describe("parsePayuniCallback（前景/背景回呼解析）", () => {
  it("驗章通過 + TradeStatus=1 → verified 且 paid", () => {
    const { encryptInfo, hashInfo } = buildCallback({ MerTradeNo: "INREC1", TradeStatus: "1", TradeAmt: "3800" });
    const r = parsePayuniCallback(encryptInfo, hashInfo, KEY, IV);
    expect(r.verified).toBe(true);
    expect(r.paid).toBe(true);
    expect(r.params.MerTradeNo).toBe("INREC1");
  });

  it("驗章通過但 TradeStatus 非 1 → verified 但未付款", () => {
    const { encryptInfo, hashInfo } = buildCallback({ MerTradeNo: "INREC2", TradeStatus: "0" });
    const r = parsePayuniCallback(encryptInfo, hashInfo, KEY, IV);
    expect(r.verified).toBe(true);
    expect(r.paid).toBe(false);
  });

  it("HashInfo 不符 → 不信任（verified=false）", () => {
    const { encryptInfo } = buildCallback({ MerTradeNo: "INREC3", TradeStatus: "1" });
    const r = parsePayuniCallback(encryptInfo, "DEADBEEF", KEY, IV);
    expect(r.verified).toBe(false);
    expect(r.paid).toBe(false);
  });

  it("缺 EncryptInfo / 金鑰 → 不信任、不丟例外", () => {
    expect(parsePayuniCallback("", "", KEY, IV).verified).toBe(false);
    expect(parsePayuniCallback("abc", "abc", "", "").verified).toBe(false);
  });

  it("亂碼 EncryptInfo（解密失敗）→ 不丟例外、verified=false", () => {
    const r = parsePayuniCallback("zzzz", "zzzz", KEY, IV);
    expect(r.verified).toBe(false);
    expect(r.paid).toBe(false);
  });
});

// 建立 PAYUNi 幕後 trade API 風格回應：外層 {Status, EncryptInfo, HashInfo} + 加密內層
function mockTradeResponse(innerParams, outerStatus = "SUCCESS") {
  const encryptInfo = aesEncrypt(new URLSearchParams(innerParams).toString(), KEY, IV);
  const hashInfo = makeHashInfo(encryptInfo, KEY, IV);
  return { Status: outerStatus, MerID: "TEST", EncryptInfo: encryptInfo, HashInfo: hashInfo };
}

describe("payuniTrade（幕後 trade API：成敗以『解密後內層』Status 判定）", () => {
  beforeEach(() => {
    process.env.PAYUNI_MERCHANT_ID = "TEST";
    process.env.PAYUNI_HASH_KEY = KEY;
    process.env.PAYUNI_HASH_IV = IV;
    process.env.PAYUNI_API_URL = "https://sandbox-api.payuni.com.tw/api/upp";
  });
  afterEach(() => { vi.restoreAllMocks(); });

  // ⬇️ 退款 bug 的回歸測試：外層 Status 非 SUCCESS、但內層 Status=SUCCESS 必須認定為成功。
  //    舊邏輯（看外層 json.Status）會把成功的退款誤判為失敗 → 後台穩定跳「退款失敗」。
  it("內層 Status=SUCCESS、外層非 SUCCESS → success=true（退款成功不誤判）", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => mockTradeResponse({ Status: "SUCCESS", Message: "退款成功", TradeNo: "T1" }, "OK"),
    });
    const r = await payuniTrade("trade/close", { TradeNo: "T1", CloseType: "2" });
    expect(r.success).toBe(true);
    expect(r.status).toBe("SUCCESS");
    expect(r.data.TradeNo).toBe("T1");
  });

  it("內層 Status 非 SUCCESS → success=false 並帶回 message（供前端顯示真正原因）", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => mockTradeResponse({ Status: "CANCEL03001", Message: "取消授權失敗，已存在請款成功紀錄" }, "SUCCESS"),
    });
    const r = await payuniTrade("trade/cancel", { TradeNo: "T1" });
    expect(r.success).toBe(false);
    expect(r.message).toContain("已存在請款成功紀錄");
  });

  it("外層無 EncryptInfo（請求未受理）→ success=false 並帶外層狀態", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ Status: "API00003", Message: "無API版本號" }),
    });
    const r = await payuniTrade("trade/close", { TradeNo: "T1", CloseType: "2" });
    expect(r.success).toBe(false);
    expect(r.status).toBe("API00003");
  });

  it("HashInfo 不符（疑似竄改）→ success=false（HASH_MISMATCH）", async () => {
    const good = mockTradeResponse({ Status: "SUCCESS" });
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ ...good, HashInfo: "DEADBEEF" }),
    });
    const r = await payuniTrade("trade/close", { TradeNo: "T1", CloseType: "2" });
    expect(r.success).toBe(false);
    expect(r.status).toBe("HASH_MISMATCH");
  });

  it("缺金鑰設定 → success=false（CONFIG），不外呼 PAYUNi", async () => {
    process.env.PAYUNI_HASH_KEY = "";
    const spy = vi.fn();
    global.fetch = spy;
    const r = await payuniTrade("trade/close", { TradeNo: "T1", CloseType: "2" });
    expect(r.success).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});
