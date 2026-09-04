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
