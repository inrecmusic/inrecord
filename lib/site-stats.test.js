import { describe, it, expect, vi, afterEach } from "vitest";
import { getSiteStats } from "./site-stats";

// 記錄查詢鏈上的每個呼叫；orders 回 count、ratings 回 data（可指定錯誤）
function makeDb(ratings = [{ score: 5 }], { ordersError = null, ratingsError = null } = {}) {
  const calls = [];
  const from = vi.fn((table) => {
    const b = new Proxy({}, {
      get(_, m) {
        if (m === "then") return (res, rej) => Promise.resolve(table === "orders" ? { count: 3, error: ordersError } : { data: ratings, error: ratingsError }).then(res, rej);
        return (...args) => { calls.push([table, m, ...args]); return b; };
      },
    });
    return b;
  });
  return { from, calls };
}

afterEach(() => vi.unstubAllEnvs());

describe("getSiteStats（首頁社會證明，首頁伺服端與 /api/stats 共用）", () => {
  it("已購買人數只算已付款且非手動開通；source 為 NULL 的舊單照算；形狀與 API 回應一致", async () => {
    const db = makeDb();
    expect(await getSiteStats(db)).toEqual({ ok: true, purchases: 3, rating: 5, ratingCount: 1 });
    expect(db.calls).toContainEqual(["orders", "eq", "status", "paid"]);
    expect(db.calls).toContainEqual(["orders", "or", "source.is.null,source.neq.manual"]);
    expect(db.calls).toContainEqual(["ratings", "eq", "hidden", false]);
  });

  it("自家／管理員帳號的評價不列入平均（大小寫／空白不影響）；沒留 email 的評價照算", async () => {
    vi.stubEnv("ADMIN_EMAIL", "inrecmusic@gmail.com");
    const stats = await getSiteStats(makeDb([
      { score: 5, user_email: "INRECMUSIC@Gmail.com " },
      { score: 4, user_email: "a@b.com" },
      { score: 3, user_email: null },
    ]));
    expect(stats).toMatchObject({ rating: 3.5, ratingCount: 2 });
  });

  it("沒有可用評價時 rating 為 null、ratingCount 為 0", async () => {
    expect(await getSiteStats(makeDb([]))).toMatchObject({ ok: true, rating: null, ratingCount: 0 });
  });

  it("任一查詢失敗回 null（呼叫端自行決定退路，首頁不因此 500）", async () => {
    expect(await getSiteStats(makeDb([], { ordersError: new Error("x") }))).toBeNull();
    expect(await getSiteStats(makeDb([], { ratingsError: new Error("x") }))).toBeNull();
  });
});
