import { describe, it, expect } from "vitest";
import { generateCode, generateBatchCodes, normalizeManualCodes, codesToCsv } from "./serial-codes.js";

describe("generateCode", () => {
  it("無前綴時只回傳指定長度的碼，且不含易混字 0 O 1 I", () => {
    const code = generateCode("", 8, () => 0); // rng=0 → 取字元集第一個
    expect(code).toHaveLength(8);
    expect(code).not.toMatch(/[0O1I]/);
  });
  it("有前綴時格式為 PREFIX-XXXX，前綴轉大寫", () => {
    const code = generateCode("live", 6, () => 0);
    expect(code).toMatch(/^LIVE-/);
    expect(code.slice(5)).toHaveLength(6);
  });
});

describe("generateBatchCodes", () => {
  it("產生指定數量、彼此唯一、且不與 existing 衝突的碼", () => {
    const existing = new Set(["LIVE-AAAA"]);
    const codes = generateBatchCodes({ prefix: "LIVE", quantity: 5, length: 4, existing });
    expect(codes).toHaveLength(5);
    expect(new Set(codes).size).toBe(5);
    for (const c of codes) expect(existing.has(c)).toBe(false);
  });
  it("數量超過上限 500 時丟錯", () => {
    expect(() => generateBatchCodes({ prefix: "X", quantity: 501 })).toThrow(/quantity/);
  });
});

describe("normalizeManualCodes", () => {
  it("逐行 trim、轉大寫、去空行、去重", () => {
    const out = normalizeManualCodes("abc\n  ABC \n\ndef\n");
    expect(out).toEqual(["ABC", "DEF"]);
  });
});

describe("codesToCsv", () => {
  it("輸出含表頭與每列欄位：序號,狀態,折扣,批次名稱", () => {
    const csv = codesToCsv(
      [{ code: "LIVE-AAAA", used: 0 }, { code: "LIVE-BBBB", used: 1 }],
      { discountLabel: "9 折", batchName: "演奏會" }
    );
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("序號,狀態,折扣,批次名稱");
    expect(lines[1]).toBe("LIVE-AAAA,未使用,9 折,演奏會");
    expect(lines[2]).toBe("LIVE-BBBB,已使用,9 折,演奏會");
  });
  it("防 CSV 公式注入：以公式字元開頭的欄位前綴單引號並加引號", () => {
    const csv = codesToCsv(
      [{ code: "=CMD()", used: 0 }],
      { discountLabel: "9 折", batchName: "演奏會" }
    );
    const lines = csv.trim().split("\n");
    expect(lines[1]).toBe(`"'=CMD()",未使用,9 折,演奏會`);
  });
});
