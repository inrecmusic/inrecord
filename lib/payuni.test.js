import { describe, it, expect } from "vitest";
import { aesEncrypt, makeHashInfo, parsePayuniCallback } from "./payuni.js";

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
