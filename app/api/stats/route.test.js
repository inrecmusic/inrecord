import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ createDistributedLimiter: () => async () => ({ allowed: true }), clientIp: () => "1.1.1.1" }));

import { GET } from "./route";
import { getSupabaseAdmin } from "@/lib/supabase";

// 記錄查詢鏈上的每個呼叫；orders 回 count、ratings 回 data
function makeDb() {
  const calls = [];
  const from = vi.fn((table) => {
    const b = new Proxy({}, {
      get(_, m) {
        if (m === "then") return (res, rej) => Promise.resolve(table === "orders" ? { count: 3, error: null } : { data: [{ score: 5 }], error: null }).then(res, rej);
        return (...args) => { calls.push([table, m, ...args]); return b; };
      },
    });
    return b;
  });
  return { from, calls };
}

describe("GET /api/stats（首頁社會證明）", () => {
  it("已購買人數只算已付款且非手動開通；source 為 NULL 的舊單照算", async () => {
    const db = makeDb();
    getSupabaseAdmin.mockReturnValue(db);
    const res = await GET(new Request("http://x/api/stats"));
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, purchases: 3, rating: 5 });
    expect(db.calls).toContainEqual(["orders", "eq", "status", "paid"]);
    expect(db.calls).toContainEqual(["orders", "or", "source.is.null,source.neq.manual"]);
  });
});
