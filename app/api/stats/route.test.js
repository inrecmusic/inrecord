import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ createDistributedLimiter: () => async () => ({ allowed: true }), clientIp: () => "1.1.1.1" }));

import { GET } from "./route";
import { getSupabaseAdmin } from "@/lib/supabase";

// 記錄查詢鏈上的每個呼叫；orders 回 count、ratings 回 data
function makeDb(ratings = [{ score: 5 }]) {
  const calls = [];
  const from = vi.fn((table) => {
    const b = new Proxy({}, {
      get(_, m) {
        if (m === "then") return (res, rej) => Promise.resolve(table === "orders" ? { count: 3, error: null } : { data: ratings, error: null }).then(res, rej);
        return (...args) => { calls.push([table, m, ...args]); return b; };
      },
    });
    return b;
  });
  return { from, calls };
}

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/stats（首頁社會證明）", () => {
  it("已購買人數只算已付款且非手動開通；source 為 NULL 的舊單照算", async () => {
    const db = makeDb();
    getSupabaseAdmin.mockReturnValue(db);
    const res = await GET(new Request("http://x/api/stats"));
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, purchases: 3, rating: 5, ratingCount: 1 });
    expect(db.calls).toContainEqual(["orders", "eq", "status", "paid"]);
    expect(db.calls).toContainEqual(["orders", "or", "source.is.null,source.neq.manual"]);
  });

  it("隱藏的評價交給 DB 過濾；自家／管理員帳號的評價不列入平均，並回傳樣本數", async () => {
    vi.stubEnv("ADMIN_EMAIL", "inrecmusic@gmail.com");
    const db = makeDb([
      { score: 5, user_email: "INRECMUSIC@Gmail.com " }, // 自家帳號（大小寫／空白不影響判斷）
      { score: 4, user_email: "a@b.com" },
      { score: 3, user_email: null },                    // 沒留 email 的評價照算
    ]);
    getSupabaseAdmin.mockReturnValue(db);
    const body = await (await GET(new Request("http://x/api/stats"))).json();
    expect(body).toMatchObject({ ok: true, rating: 3.5, ratingCount: 2 });
    expect(db.calls).toContainEqual(["ratings", "eq", "hidden", false]);
  });

  it("沒有可用評價時 rating 為 null、ratingCount 為 0", async () => {
    getSupabaseAdmin.mockReturnValue(makeDb([]));
    const body = await (await GET(new Request("http://x/api/stats"))).json();
    expect(body).toMatchObject({ ok: true, rating: null, ratingCount: 0 });
  });
});
