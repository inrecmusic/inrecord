import { describe, it, expect } from "vitest";
import { excludeManual, paidOrderCount } from "./order-stats";

// 側欄「訂單管理」徽章＝已付款訂單數（不含手動開通），與訂單頁「已付款訂單」卡同一個數字。
describe("paidOrderCount", () => {
  it("只算 status='paid' 且非手動開通；pending／refunded／manual 都不算", () => {
    expect(paidOrderCount([
      { id: 1, status: "paid", source: "payuni" },
      { id: 2, status: "paid", source: "concert" },
      { id: 3, status: "paid", source: "manual", amount: 0 },
      { id: 4, status: "pending", source: "payuni" },
      { id: 5, status: "refunded", source: "payuni" },
      { id: 6, status: "paid" }, // 無 source（舊資料）照算
    ])).toBe(3);
  });

  it("空輸入 → 0", () => {
    expect(paidOrderCount([])).toBe(0);
    expect(paidOrderCount(undefined)).toBe(0);
  });
});

// 後台儀表板「本月訂單」與訂單管理「已付款訂單」兩張卡：
// 手動開通單（source='manual'，status='paid'、amount 0）不是真實成交，不計入筆數。
describe("excludeManual", () => {
  it("濾掉 source='manual'，其餘（payuni/concert/woocommerce/無 source）原樣保留、順序不變", () => {
    const orders = [
      { id: 1, source: "payuni", status: "paid" },
      { id: 2, source: "manual", status: "paid" },
      { id: 3, source: "concert", status: "paid" },
      { id: 4, status: "paid" },
      { id: 5, source: "manual", status: "paid" },
    ];
    expect(excludeManual(orders).map(o => o.id)).toEqual([1, 3, 4]);
  });

  it("空陣列／undefined 回空陣列", () => {
    expect(excludeManual([])).toEqual([]);
    expect(excludeManual()).toEqual([]);
  });
});

import { isNonRevenueOrder, supersededPendingIds, paidEmailSet, TEST_PAYMENT_MAX } from "./order-stats";

describe("測試付款（NT$1 之類）不計入營收／購買人數", () => {
  it("已付款且金額低於門檻 → 視為非真實成交；正常售價、待付款、沒帶金額欄位都不受影響", () => {
    expect(TEST_PAYMENT_MAX).toBe(100);
    expect(isNonRevenueOrder({ status: "paid", source: "payuni", amount: 1 })).toBe(true);
    expect(isNonRevenueOrder({ status: "paid", source: "manual", amount: 0 })).toBe(true);
    expect(isNonRevenueOrder({ status: "paid", source: "payuni", amount: 4549 })).toBe(false);
    expect(isNonRevenueOrder({ status: "paid", source: "payuni", amount: 100 })).toBe(false);
    expect(isNonRevenueOrder({ status: "pending", source: "payuni", amount: 1 })).toBe(false);
    expect(isNonRevenueOrder({ status: "paid", source: "payuni" })).toBe(false);          // 只撈部分欄位時不誤判
    expect(isNonRevenueOrder({ source: "payuni", amount: 1 })).toBe(true);                // 沒帶 status 的已付款名單
  });
  it("excludeManual／paidOrderCount 一併排除測試付款", () => {
    const orders = [
      { id: 1, status: "paid", source: "payuni", amount: 4549 },
      { id: 2, status: "paid", source: "payuni", amount: 1 },
      { id: 3, status: "paid", source: "manual", amount: 0 },
    ];
    expect(excludeManual(orders).map((o) => o.id)).toEqual([1]);
    expect(paidOrderCount(orders)).toBe(1);
  });
});

describe("supersededPendingIds：後來已付款的未完成單", () => {
  const T = (d) => `2026-10-0${d}T10:00:00Z`;
  it("同一買家之後付款成功 → 先前的 pending／failed 單被取代；之前就付過的不算「後來」", () => {
    const orders = [
      { id: "p1", status: "pending", email: "A@x.com", created_at: T(1) },
      { id: "f1", status: "failed", email: "a@x.com", created_at: T(1) },
      { id: "paid1", status: "paid", source: "payuni", amount: 4549, email: "a@x.com", created_at: T(2) },
      { id: "p2", status: "pending", email: "b@x.com", created_at: T(1) },       // 沒付款 → 仍待處理
      { id: "p3", status: "pending", email: "a@x.com", created_at: T(3) },       // 付款之後又下的新單 → 仍待處理
    ];
    expect([...supersededPendingIds(orders)].sort()).toEqual(["f1", "p1"]);
  });
  it("用開通信箱（grant_email）付款也算；手動開通與測試付款不算「已付款」", () => {
    const orders = [
      { id: "p1", status: "pending", email: "buyer@x.com", created_at: T(1) },
      { id: "paid1", status: "paid", source: "payuni", amount: 4549, email: "other@x.com", grant_email: "buyer@x.com", created_at: T(2) },
      { id: "p2", status: "pending", email: "t@x.com", created_at: T(1) },
      { id: "m1", status: "paid", source: "manual", amount: 0, email: "t@x.com", created_at: T(2) },
      { id: "p3", status: "pending", email: "u@x.com", created_at: T(1) },
      { id: "t1", status: "paid", source: "payuni", amount: 1, email: "u@x.com", created_at: T(2) },
    ];
    expect([...supersededPendingIds(orders)]).toEqual(["p1"]);
  });
  it("沒有任何已付款單 → 沒有單被取代", () => {
    expect(supersededPendingIds([{ id: "p", status: "pending", email: "a@x.com", created_at: T(1) }]).size).toBe(0);
    expect(supersededPendingIds().size).toBe(0);
  });
});

describe("paidEmailSet", () => {
  it("下單信箱與開通信箱都收，小寫；手動開通與測試付款不收", () => {
    const s = paidEmailSet([
      { status: "paid", source: "payuni", amount: 4549, email: "A@x.com", grant_email: "G@x.com" },
      { status: "paid", source: "manual", amount: 0, email: "m@x.com" },
      { status: "paid", source: "payuni", amount: 1, email: "t@x.com" },
      { status: "pending", email: "p@x.com" },
    ]);
    expect([...s].sort()).toEqual(["a@x.com", "g@x.com"]);
  });
});
