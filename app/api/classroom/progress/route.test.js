import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const limit = vi.fn(async () => ({ allowed: globalThis.__rlAllowed !== false, retryAfter: 42 }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { getUser } }) }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => globalThis.__sb }));
vi.mock("@/lib/course-access", () => ({ hasCourseAccess: vi.fn(async () => true) }));
vi.mock("@/lib/rate-limit", () => ({ createDistributedLimiter: () => (...a) => limit(...a), clientIp: () => "1.1.1.1" }));

import { POST } from "./route";
import { makeSupabaseMock } from "@/lib/test-helpers/supabase-mock";

const USER = { id: "u1", email: "student@x.com" };
const rpc = vi.fn(async () => ({ data: { video_id: "v1", completed: false }, error: null }));

const req = (body) => new Request("http://x/api/classroom/progress", {
  method: "POST",
  headers: { authorization: "Bearer t", "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("POST /api/classroom/progress（心跳限流）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.__rlAllowed = true;
    getUser.mockResolvedValue({ data: { user: USER }, error: null });
    globalThis.__sb = { ...makeSupabaseMock(() => ({ data: null, error: null })), rpc };
  });

  it("正常心跳 → 200 並寫入進度，限流以 user.id 為 key（非 IP）", async () => {
    const res = await POST(req({ video_id: "v1", watched_seconds: 30, total_seconds: 100, viewed_delta: 10 }));
    expect(res.status).toBe(200);
    expect(limit).toHaveBeenCalledWith("u1");
    expect(rpc).toHaveBeenCalledWith("upsert_progress", expect.objectContaining({ p_user_id: "u1", p_viewed_delta: 10 }));
  });

  it("超過門檻 → 429 帶 Retry-After，且完全不碰資料庫（擋迴圈刷完成度換證書）", async () => {
    globalThis.__rlAllowed = false;
    const res = await POST(req({ video_id: "v1", watched_seconds: 30, total_seconds: 100, viewed_delta: 15 }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(await res.json()).toEqual({ error: "rate_limited" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("未登入 → 401，且不消耗限流額度", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "bad jwt" } });
    expect((await POST(req({ video_id: "v1" }))).status).toBe(401);
    expect(limit).not.toHaveBeenCalled();
  });
});
