import { describe, it, expect } from "vitest";
import { excludeManual } from "./order-stats";

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
