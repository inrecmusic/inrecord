import { describe, it, expect } from "vitest";
import { isClassroomOpen, isPresale, activeWave, listPrice, listAnchor, currentPrice, saleState, isOnSale, salePhase } from "./sale.js";

const iso = (s) => new Date(s).toISOString();
const settings = {
  open_at: iso("2026-09-04T00:00:00+08:00"),
  lock_override: null,
  launch_notified_at: null,
  list_price: { course: 6800, bundle: 5800 },
  waves: [
    { starts_at: iso("2026-07-08T00:00:00+08:00"), ends_at: iso("2026-07-20T00:00:00+08:00"), prices: { course: 5500, bundle: 4299 } },
    { starts_at: iso("2026-07-20T00:00:00+08:00"), ends_at: iso("2026-08-06T00:00:00+08:00"), prices: { course: 5800, bundle: 4799 } },
    { starts_at: iso("2026-08-06T00:00:00+08:00"), ends_at: iso("2026-09-04T00:00:00+08:00"), prices: { course: 6200, bundle: 5299 } },
  ],
};
const tPre  = new Date("2026-07-01T00:00:00+08:00");
const tW1   = new Date("2026-07-10T00:00:00+08:00");
const tW2   = new Date("2026-07-25T00:00:00+08:00");
const tW3   = new Date("2026-08-10T00:00:00+08:00");
const tList = new Date("2026-09-10T00:00:00+08:00");

describe("activeWave / currentPrice", () => {
  it("開賣前無波段", () => expect(activeWave(settings, tPre)).toBeNull());
  it("第一波命中", () => expect(activeWave(settings, tW1)?.prices.bundle).toBe(4299));
  it("第一波 bundle", () => expect(currentPrice("bundle", settings, tW1)).toBe(4299));
  it("第二波 course", () => expect(currentPrice("course", settings, tW2)).toBe(5800));
  it("第三波 bundle", () => expect(currentPrice("bundle", settings, tW3)).toBe(5299));
  it("牌價後 bundle", () => expect(currentPrice("bundle", settings, tList)).toBe(5800));
  it("開賣前回牌價（onSale 另擋）", () => expect(currentPrice("bundle", settings, tPre)).toBe(5800));
  it("起含 now==starts_at → 該波", () => expect(currentPrice("bundle", settings, new Date("2026-07-08T00:00:00+08:00"))).toBe(4299));
  it("迄不含 now==ends_at → 下一波", () => expect(currentPrice("bundle", settings, new Date("2026-07-20T00:00:00+08:00"))).toBe(4799));
  it("波段價>牌價 → 取牌價防呆", () =>
    expect(currentPrice("bundle", { ...settings, waves: [{ starts_at: settings.waves[0].starts_at, ends_at: settings.waves[0].ends_at, prices: { bundle: 9999 } }] }, tW1)).toBe(5800));
  it("無 waves → 牌價", () => expect(currentPrice("bundle", { ...settings, waves: [] }, tW1)).toBe(5800));
  it("settings null → PLAN_CATALOG", () => expect(currentPrice("bundle", null, tW1)).toBe(3999));
  it("list_price 缺 → PLAN_CATALOG", () => expect(currentPrice("course", { ...settings, list_price: {} }, tList)).toBe(3800));
  it("listPrice 直接取牌價", () => expect(listPrice("course", settings)).toBe(6800));
  it("listPrice 缺設定 → PLAN_CATALOG", () => expect(listPrice("course", null)).toBe(3800));
});

describe("saleState / isOnSale", () => {
  it("開賣前 pre_launch", () => expect(saleState(settings, tPre)).toBe("pre_launch"));
  it("波段中 wave", () => expect(saleState(settings, tW2)).toBe("wave"));
  it("牌價 list", () => expect(saleState(settings, tList)).toBe("list"));
  it("無 waves → list（非 pre_launch）", () => expect(saleState({ ...settings, waves: [] }, tPre)).toBe("list"));
  it("isOnSale 開賣前 false", () => expect(isOnSale(settings, tPre)).toBe(false));
  it("isOnSale 波段中 true", () => expect(isOnSale(settings, tW1)).toBe(true));
  it("波段間隙 → list 態", () => {
    const gapped = { ...settings, waves: [
      { starts_at: new Date("2026-07-08T00:00:00+08:00").toISOString(), ends_at: new Date("2026-07-12T00:00:00+08:00").toISOString(), prices: { course: 5500, bundle: 4299 } },
      { starts_at: new Date("2026-07-20T00:00:00+08:00").toISOString(), ends_at: new Date("2026-08-06T00:00:00+08:00").toISOString(), prices: { course: 5800, bundle: 4799 } },
    ]};
    const inGap = new Date("2026-07-15T00:00:00+08:00");
    expect(saleState(gapped, inGap)).toBe("list");
    expect(currentPrice("bundle", gapped, inGap)).toBe(5800);
  });
});

describe("salePhase", () => {
  it("開賣前", () => {
    const p = salePhase(settings, tPre);
    expect(p.state).toBe("pre_launch");
    expect(p.onSale).toBe(false);
    expect(p.salesStartAt).toBe(settings.waves[0].starts_at);
    expect(p.classroomOpen).toBe(false);
  });
  it("波段中：早鳥價＋刪除線錨點＋nextIncreaseAt", () => {
    const p = salePhase(settings, tW1);
    expect(p.state).toBe("wave");
    expect(p.plans.bundle).toEqual({ price: 4299, originalPrice: 5800, isEarlyBird: true });
    expect(p.nextIncreaseAt).toBe(settings.waves[0].ends_at);
  });
  it("牌價＋開課", () => {
    const p = salePhase(settings, tList);
    expect(p.plans.course).toEqual({ price: 6800, originalPrice: 6800, isEarlyBird: false });
    expect(p.classroomOpen).toBe(true);
    expect(p.nextIncreaseAt).toBeNull();
  });
});

describe("listAnchor / 劃線原價≠正式售價", () => {
  const anchored = {
    ...settings,
    list_price: { bundle: 7999 },     // 波段結束後的常態售價
    list_anchor: { bundle: 10800 },   // 劃線原價（錨點）
    waves: [
      { starts_at: iso("2026-08-07T00:00:00+08:00"), ends_at: iso("2026-08-21T00:00:00+08:00"), prices: { bundle: 4299 } },
    ],
  };
  const tWave = new Date("2026-08-10T00:00:00+08:00");
  const tAfter = new Date("2026-10-05T00:00:00+08:00");
  it("listAnchor 取 list_anchor", () => expect(listAnchor("bundle", anchored)).toBe(10800));
  it("listAnchor 未設 → 回退 list_price", () => expect(listAnchor("bundle", settings)).toBe(5800));
  it("波段中：售價=波段價、劃線=錨點", () =>
    expect(salePhase(anchored, tWave).plans.bundle).toEqual({ price: 4299, originalPrice: 10800, isEarlyBird: true }));
  it("波段後 list 態：售價 7999、劃線 10800", () => {
    const p = salePhase(anchored, tAfter);
    expect(p.state).toBe("list");
    expect(p.plans.bundle).toEqual({ price: 7999, originalPrice: 10800, isEarlyBird: false });
  });
  it("波段中夾擠用 anchor 防呆", () =>
    expect(currentPrice("bundle", { ...anchored, waves: [{ starts_at: anchored.waves[0].starts_at, ends_at: anchored.waves[0].ends_at, prices: { bundle: 99999 } }] }, tWave)).toBe(10800));
});

describe("isClassroomOpen / isPresale（沿用）", () => {
  it("開課前鎖", () => expect(isClassroomOpen(settings, tW1)).toBe(false));
  it("開課後開", () => expect(isClassroomOpen(settings, tList)).toBe(true));
  it("override locked", () => expect(isClassroomOpen({ ...settings, lock_override: "locked" }, tList)).toBe(false));
  it("isPresale 開課前 true", () => expect(isPresale(settings, tW1)).toBe(true));
  it("isClassroomOpen override 'open' 一律開", () => expect(isClassroomOpen({ ...settings, lock_override: "open" }, tW1)).toBe(true));
  it("isClassroomOpen null settings → 鎖", () => expect(isClassroomOpen(null, tList)).toBe(false));
  it("isClassroomOpen 無 open_at → 鎖", () => expect(isClassroomOpen({ ...settings, open_at: null }, tList)).toBe(false));
  it("isClassroomOpen now==open_at → 開", () => expect(isClassroomOpen(settings, new Date(settings.open_at))).toBe(true));
  it("isPresale 開課後 false", () => expect(isPresale(settings, tList)).toBe(false));
});
