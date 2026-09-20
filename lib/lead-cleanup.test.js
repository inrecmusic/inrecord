import { describe, it, expect } from "vitest";
import { fetchBuyerEmails, matchBoughtLeads } from "./lead-cleanup.js";

// selectAll 會一直翻頁直到某批少於 1000 列，所以假的 supabase 只要回一批就會停
function fakeSupabase({ orders = [], enrollments = [] } = {}) {
  const rows = { orders, enrollments };
  return {
    from(table) {
      const q = {
        select() { return q; },
        eq() { return q; },
        range: async () => ({ data: rows[table] || [], error: null }),
      };
      return q;
    },
  };
}

describe("matchBoughtLeads（潛客名單中已購買者）", () => {
  it("大小寫／前後空白不影響比對，結果正規化且去重", () => {
    const buyers = new Set(["a@x.com", "b@x.com"]);
    expect(matchBoughtLeads([" A@X.com ", "c@x.com", "a@x.com", "B@x.com"], buyers))
      .toEqual(["a@x.com", "b@x.com"]);
  });

  it("沒買過的人不會被挑出來", () => {
    expect(matchBoughtLeads(["c@x.com", "d@x.com"], new Set(["a@x.com"]))).toEqual([]);
  });

  it("空輸入不會出錯", () => {
    expect(matchBoughtLeads(null, new Set())).toEqual([]);
    expect(matchBoughtLeads([], new Set(["a@x.com"]))).toEqual([]);
  });
});

describe("fetchBuyerEmails（已付款訂單 ∪ 已開通）", () => {
  it("同時收下單信箱與指定開通信箱，並聯集 enrollments", async () => {
    const sb = fakeSupabase({
      orders: [
        { email: "Buyer@X.com", grant_email: "learner@x.com" },
        { email: "solo@x.com", grant_email: null },
      ],
      enrollments: [{ email: "MANUAL@x.com" }],
    });
    const set = await fetchBuyerEmails(sb);
    expect([...set].sort()).toEqual(["buyer@x.com", "learner@x.com", "manual@x.com", "solo@x.com"]);
  });

  it("沒有任何資料時回空集合", async () => {
    expect((await fetchBuyerEmails(fakeSupabase())).size).toBe(0);
  });
});
