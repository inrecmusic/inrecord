import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1", email: "a@x.com" } }, error: null }) } }),
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/course-access", () => ({ hasCourseAccess: vi.fn(async () => true) }));
vi.mock("@/lib/rate-limit", () => ({ createDistributedLimiter: () => async () => ({ allowed: true }), clientIp: () => "1.1.1.1" }));

import { POST } from "./route";
import { getSupabaseAdmin } from "@/lib/supabase";

// 每個案例用不同 UUID：route 模組層有 5 分鐘的影片快取，共用同一支會互相污染
const uuid = (n) => `1111111${n}-2222-3333-4444-555555555555`;
const post = (body) => POST(new Request("http://x/api/classroom/progress", {
  method: "POST", headers: { authorization: "Bearer t", "content-type": "application/json" }, body: JSON.stringify(body),
}));

function makeDb(video) {
  const rpc = vi.fn(async () => ({ data: { completed: false }, error: null }));
  return { rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: video, error: null }) }) }) }) };
}

describe("POST /api/classroom/progress（完成判定的分母以伺服器端長度為準）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("以後台 duration 當分母：前端謊報 total_seconds=1 也不影響門檻", async () => {
    const db = makeDb({ published: true, duration: "10:00" });
    getSupabaseAdmin.mockReturnValue(db);
    await post({ video_id: uuid(1), watched_seconds: 1, total_seconds: 1, viewed_delta: 1 });
    expect(db.rpc.mock.calls[0][1].p_total).toBe(600);
  });

  it("後台沒填 duration → 退回前端值（由 SQL 的 GREATEST 保底）", async () => {
    const db = makeDb({ published: true, duration: null });
    getSupabaseAdmin.mockReturnValue(db);
    await post({ video_id: uuid(2), watched_seconds: 5, total_seconds: 300, viewed_delta: 10 });
    expect(db.rpc.mock.calls[0][1].p_total).toBe(300);
  });

  it("viewed_delta 仍夾在 15 秒（單次心跳無法灌大量觀看時數）", async () => {
    const db = makeDb({ published: true, duration: "10:00" });
    getSupabaseAdmin.mockReturnValue(db);
    await post({ video_id: uuid(3), watched_seconds: 1, total_seconds: 600, viewed_delta: 9999 });
    expect(db.rpc.mock.calls[0][1].p_viewed_delta).toBe(15);
  });

  it("watched_seconds 夾在伺服器端長度內，不會因前端謊報而超出", async () => {
    const db = makeDb({ published: true, duration: "10:00" });
    getSupabaseAdmin.mockReturnValue(db);
    await post({ video_id: uuid(5), watched_seconds: 999999, total_seconds: 999999, viewed_delta: 5 });
    expect(db.rpc.mock.calls[0][1].p_watched).toBe(600);
  });

  it("未發布的單元 → 404，不寫進度", async () => {
    const db = makeDb({ published: false, duration: "10:00" });
    getSupabaseAdmin.mockReturnValue(db);
    expect((await post({ video_id: uuid(4), total_seconds: 600, viewed_delta: 10 })).status).toBe(404);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("查無該影片 → 404", async () => {
    const db = makeDb(null);
    getSupabaseAdmin.mockReturnValue(db);
    expect((await post({ video_id: uuid(6), total_seconds: 600, viewed_delta: 10 })).status).toBe(404);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("video_id 非 UUID → 400，不查 DB", async () => {
    const db = makeDb({ published: true, duration: "10:00" });
    getSupabaseAdmin.mockReturnValue(db);
    expect((await post({ video_id: "'; drop--", total_seconds: 600 })).status).toBe(400);
    expect(db.rpc).not.toHaveBeenCalled();
  });
});
