import { describe, it, expect } from "vitest";
import { parseTermsVersion, readTermsVersion, buildOrderSummary, LICENSE_TERM_TEXT } from "./terms-version.js";

describe("parseTermsVersion", () => {
  it("從「最後更新：2026 年 9 月 7 日」抓出 2026-09-07（月日補零）", () => {
    expect(parseTermsVersion("# 服務條款\n\nInRecord｜音樂刻 ／ 最後更新：2026 年 9 月 7 日\n")).toBe("2026-09-07");
    expect(parseTermsVersion("最後更新: 2026年12月31日")).toBe("2026-12-31");
  });
  it("找不到日期 → null", () => {
    expect(parseTermsVersion("沒有日期")).toBeNull();
    expect(parseTermsVersion("")).toBeNull();
  });
});

describe("readTermsVersion", () => {
  const sb = (body) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: body == null ? null : { body_md: body } }) }) }) }) });
  it("後台存過的條款 → 用它的日期", async () => {
    expect(await readTermsVersion(sb("最後更新：2026 年 9 月 7 日"))).toBe("2026-09-07");
  });
  it("沒存過 → 用程式內建預設條款的日期；DB 壞掉也不丟錯", async () => {
    expect(await readTermsVersion(sb(null))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await readTermsVersion({ from: () => { throw new Error("db down"); } })).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await readTermsVersion(null)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("buildOrderSummary（結帳第二步摘要）", () => {
  it("六列：課程／實付／付款方式／授權期間／發票／條款版本", () => {
    const rows = buildOrderSummary({ planLabel: "課程包 AI", amount: 4299, invoiceType: "email", termsVersion: "2026-09-07" });
    expect(rows.map((r) => r[0])).toEqual(["課程名稱", "實付價格", "付款方式", "授權期間", "發票", "服務條款版本"]);
    expect(rows[0][1]).toContain("課程包 AI");
    expect(rows[1][1]).toBe("NT$4,299");
    expect(rows[2][1]).toMatch(/信用卡/);
    expect(rows[3][1]).toBe(LICENSE_TERM_TEXT);
    expect(rows[5][1]).toBe("2026-09-07");
  });
  it("優惠碼、手機載具、公司統編都會反映在摘要", () => {
    expect(buildOrderSummary({ planLabel: "x", amount: 1, couponCode: "TEST1", invoiceType: "mobile", carrierId: "/ABC1234" })[1][1]).toBe("NT$1（已套用優惠碼 TEST1）");
    expect(buildOrderSummary({ planLabel: "x", amount: 1, invoiceType: "mobile", carrierId: "/ABC1234" })[4][1]).toContain("/ABC1234");
    expect(buildOrderSummary({ planLabel: "x", amount: 1, invoiceType: "company", taxId: "12345678", companyName: "碩樂" })[4][1]).toContain("12345678");
    expect(buildOrderSummary({ planLabel: "x", amount: 1, invoiceType: "email" })[5][1]).toBe("—");
  });
});
