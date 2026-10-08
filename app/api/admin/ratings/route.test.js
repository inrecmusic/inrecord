import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/adminAuth", () => ({ verifyAdminToken: vi.fn(async () => ({ email: "admin@test" })) }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));

import { PATCH } from "./route";
import { getSupabaseAdmin } from "@/lib/supabase";
import { makeSupabaseMock } from "@/lib/test-helpers/supabase-mock";

const req = (body) => new Request("http://x/api/admin/ratings", { method: "PATCH", body: JSON.stringify(body) });

describe("PATCH /api/admin/ratings（後台切換隱藏／首頁精選）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("featured 可更新（轉布林）", async () => {
    const sb = makeSupabaseMock(() => ({ data: { id: "r1", featured: true }, error: null }));
    getSupabaseAdmin.mockReturnValue(sb);
    const res = await PATCH(req({ id: "r1", featured: 1 }));
    expect(res.status).toBe(200);
    expect(sb.calls[0].ops).toContainEqual({ m: "update", args: [{ featured: true }] });
  });

  it("hidden 與 featured 可同時更新；白名單外欄位被忽略", async () => {
    const sb = makeSupabaseMock(() => ({ data: { id: "r1" }, error: null }));
    getSupabaseAdmin.mockReturnValue(sb);
    await PATCH(req({ id: "r1", hidden: true, featured: false, score: 1, user_email: "x@x" }));
    expect(sb.calls[0].ops).toContainEqual({ m: "update", args: [{ hidden: true, featured: false }] });
  });

  it("缺 id → 400", async () => {
    getSupabaseAdmin.mockReturnValue(makeSupabaseMock(() => ({ data: null, error: null })));
    expect((await PATCH(req({ featured: true }))).status).toBe(400);
  });
});
