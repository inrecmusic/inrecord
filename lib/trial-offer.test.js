// 試看頁導購價格三態：全部由 sale_settings → salePhase() 推導，後台改價會自動跟著變。
import { describe, it, expect } from "vitest";
import { salePhase } from "@/lib/sale";
import { trialOffer } from "./trial-offer";

const settings = {
  open_at: "2026-10-31T00:00:00+08:00",
  list_price: { bundle: 13800 },
  waves: [
    { starts_at: "2026-09-14T00:00:00+08:00", ends_at: "2026-09-26T00:00:00+08:00", prices: { bundle: 4299 } },
    { starts_at: "2026-09-26T00:00:00+08:00", ends_at: "2026-10-08T00:00:00+08:00", prices: { bundle: 4799 } },
  ],
  fan_plan: { enabled: true, deadline: "2026-09-16T23:59:00+08:00", proof_price: 3699, direct_price: 3999 },
};
const offerAt = (iso, s = settings) => trialOffer(salePhase(s, new Date(iso)));

describe("trialOffer", () => {
  it("粉絲方案還開著 → 粉絲直購價 ＋ 截止倒數（台灣時間標籤）", () => {
    const o = offerAt("2026-09-13T12:00:00+08:00");
    expect(o.mode).toBe("fan");
    expect(o.price).toBe(3999);
    expect(o.originalPrice).toBe(13800);
    expect(o.deadlineMs).toBe(Date.parse("2026-09-16T23:59:00+08:00"));
    expect(o.deadlineLabel).toBe("9/16 23:59");
  });

  it("粉絲已截止但在波段中 → 當下波段價 ＋ 下次調漲倒數", () => {
    const o = offerAt("2026-09-20T12:00:00+08:00");
    expect(o.mode).toBe("wave");
    expect(o.price).toBe(4299);
    expect(o.deadlineMs).toBe(Date.parse("2026-09-26T00:00:00+08:00"));
    expect(o.deadlineLabel).toBe("9/26 00:00");
  });

  it("波段全部結束 → none（只給方案連結、不顯示價格）", () => {
    const o = offerAt("2026-10-20T12:00:00+08:00");
    expect(o.mode).toBe("none");
    expect(o.price).toBeUndefined();
  });

  it("後台把粉絲方案關掉 → 同一時間點立刻退回波段價，不再露出粉絲價", () => {
    const off = { ...settings, fan_plan: { ...settings.fan_plan, enabled: false } };
    expect(offerAt("2026-09-15T12:00:00+08:00").mode).toBe("fan"); // 開著時是粉絲價
    const o = offerAt("2026-09-15T12:00:00+08:00", off);
    expect(o.mode).toBe("wave");
    expect(o.price).toBe(4299);
  });

  it("後台改價／改截止 → 導購視窗跟著變（沒有任何寫死）", () => {
    const changed = {
      ...settings,
      list_price: { bundle: 15800 },
      fan_plan: { ...settings.fan_plan, direct_price: 3499, deadline: "2026-09-18T21:30:00+08:00" },
    };
    const o = offerAt("2026-09-13T12:00:00+08:00", changed);
    expect(o.price).toBe(3499);
    expect(o.originalPrice).toBe(15800);
    expect(o.deadlineLabel).toBe("9/18 21:30");
  });

  it("讀不到設定／缺方案 → fail-closed 回 none，寧可不報價也不報錯價", () => {
    expect(trialOffer(null).mode).toBe("none");
    expect(trialOffer({}).mode).toBe("none");
    expect(trialOffer({ plans: {} }).mode).toBe("none");
  });
});
