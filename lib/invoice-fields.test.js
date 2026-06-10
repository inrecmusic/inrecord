import { describe, it, expect } from "vitest";
import { isValidTaxId, isValidMobileBarcode, MOBILE_CARRIER_TYPE } from "./invoice-fields.js";

describe("isValidTaxId（統一編號檢查碼）", () => {
  it("一般有效統編（加權積和可被 5 整除）", () => {
    expect(isValidTaxId("04595257")).toBe(true); // 加權積和 = 40
  });

  it("第 7 碼為 7 的 +1 例外規則", () => {
    expect(isValidTaxId("12345675")).toBe(true); // 積和 39，digit[6]=7 → (39+1)%5==0
  });

  it("檢查碼錯誤的統編", () => {
    expect(isValidTaxId("12345678")).toBe(false); // 積和 42，例外也不成立
  });

  it("全 0 一律無效", () => {
    expect(isValidTaxId("00000000")).toBe(false);
  });

  it("非 8 位數字格式一律無效", () => {
    expect(isValidTaxId("1234567")).toBe(false);   // 7 碼
    expect(isValidTaxId("123456789")).toBe(false);  // 9 碼
    expect(isValidTaxId("1234567a")).toBe(false);   // 含字母
    expect(isValidTaxId("")).toBe(false);
  });
});

describe("isValidMobileBarcode（手機條碼載具）", () => {
  it("斜線開頭 + 7 碼大寫英數與 .+- 為有效", () => {
    expect(isValidMobileBarcode("/ABC1234")).toBe(true);
    expect(isValidMobileBarcode("/A.+-7Z9")).toBe(true);
  });

  it("缺斜線、長度錯誤或含小寫為無效", () => {
    expect(isValidMobileBarcode("ABC1234")).toBe(false);   // 無斜線
    expect(isValidMobileBarcode("/abc1234")).toBe(false);  // 小寫
    expect(isValidMobileBarcode("/ABC123")).toBe(false);   // 只有 6 碼
    expect(isValidMobileBarcode("/ABC12345")).toBe(false); // 8 碼
    expect(isValidMobileBarcode("/ABC 123")).toBe(false);  // 含空白
  });
});

describe("MOBILE_CARRIER_TYPE", () => {
  it("Amego 手機條碼載具代碼固定為 3J0002", () => {
    expect(MOBILE_CARRIER_TYPE).toBe("3J0002");
  });
});
