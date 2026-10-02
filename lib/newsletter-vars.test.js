import { describe, it, expect } from "vitest";
import { saleVars, substituteSaleVars, nextPriceAfter } from "./newsletter-vars.js";

// 兩段波段：9/14–9/25 4,299；9/25–10/7 4,799；牌價 13,800
const settings = {
  list_price: { bundle: 13800 },
  list_anchor: { bundle: 13800 },
  waves: [
    { starts_at: "2026-09-13T16:00:00Z", ends_at: "2026-09-24T16:00:00Z", prices: { bundle: 4299 } },
    { starts_at: "2026-09-24T16:00:00Z", ends_at: "2026-10-06T16:00:00Z", prices: { bundle: 4799 } },
  ],
  fan_plan: { proof_discount: 300 },
};
const at = (iso) => Date.parse(iso);

describe("nextPriceAfter", () => {
  it("第一波期間 → 下一段是第二波價", () => {
    expect(nextPriceAfter(settings, "bundle", at("2026-09-18T10:00:00+08:00"))).toBe(4799);
  });
  it("最後一波期間 → 下一段是牌價", () => {
    expect(nextPriceAfter(settings, "bundle", at("2026-10-01T10:00:00+08:00"))).toBe(13800);
  });
  it("不在任何波段 → null（不猜）", () => {
    expect(nextPriceAfter(settings, "bundle", at("2026-11-05T10:00:00+08:00"))).toBe(null);
  });
});

describe("saleVars", () => {
  const v = saleVars(settings, { nowMs: at("2026-09-18T10:00:00+08:00") });
  it("售價、原價、下次售價都帶千分位", () => {
    expect(v["目前售價"]).toBe("NT$4,299");
    expect(v["原價"]).toBe("NT$13,800");
    expect(v["下次售價"]).toBe("NT$4,799");
  });
  it("截止日期講「當日」而不是結束時間的隔天", () => {
    expect(v["截止日期"]).toBe("9 月 24 日");
    expect(v["調漲日期"]).toBe("9 月 25 日");
  });
  it("剩餘天數以整天計", () => {
    expect(v["剩餘天數"]).toBe("6");
  });
  it("不足一天講「不到 1」，不會寫成剩 0 天", () => {
    const x = saleVars(settings, { nowMs: at("2026-09-24T20:00:00+08:00") });
    expect(x["剩餘天數"]).toBe("不到 1");
  });
  it("憑證價＝當下售價減折抵", () => {
    expect(v["憑證折抵"]).toBe("NT$300");
    expect(v["憑證價"]).toBe("NT$3,999");
  });
});

describe("substituteSaleVars", () => {
  const md = "目前 {{目前售價}}，{{調漲日期}} 起調整為 {{下次售價}}，還剩 {{剩餘天數}} 天。";
  it("把佔位符換成當下數字", () => {
    expect(substituteSaleVars(md, settings, { nowMs: at("2026-09-18T10:00:00+08:00") }))
      .toBe("目前 NT$4,299，9 月 25 日 起調整為 NT$4,799，還剩 6 天。");
  });
  it("未知的佔位符原樣保留，不把內文吃掉", () => {
    expect(substituteSaleVars("{{不存在}}", settings)).toBe("{{不存在}}");
  });
  it("讀不到設定時原樣回傳（寧可留佔位符，也不要寄出錯誤金額）", () => {
    expect(substituteSaleVars(md, null)).toBe(md);
  });
  it("空白容錯：{{ 目前售價 }} 也認得", () => {
    expect(substituteSaleVars("{{ 目前售價 }}", settings, { nowMs: at("2026-09-18T10:00:00+08:00") })).toBe("NT$4,299");
  });
});

describe("{{折數}}", () => {
  const S = (price) => ({
    list_price: { bundle: 13800 },
    waves: [{ starts_at: "2026-10-01T16:00:00Z", ends_at: "2026-10-08T16:00:00Z", prices: { bundle: price } }],
  });
  const at = Date.parse("2026-10-02T09:00:00+08:00");
  it("無條件捨去到小數一位，不把折扣講得比實際甜", () => {
    // 4549 / 13800 = 0.3296 → 3.2 折（不是 3.3）
    expect(saleVars(S(4549), { nowMs: at })["折數"]).toBe("3.2 折");
    expect(saleVars(S(4799), { nowMs: at })["折數"]).toBe("3.4 折");
    expect(saleVars(S(6900), { nowMs: at })["折數"]).toBe("5 折");
  });
  it("沒折扣就回空字串，不會寄出「10 折」", () => {
    expect(saleVars(S(13800), { nowMs: at })["折數"]).toBe("");
    expect(saleVars(S(14000), { nowMs: at })["折數"]).toBe("");
  });
  it("可在內文代入", () => {
    expect(substituteSaleVars("限時優惠 {{折數}}", S(4549), { nowMs: at })).toBe("限時優惠 3.2 折");
  });
});
