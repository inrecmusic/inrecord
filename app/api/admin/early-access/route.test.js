import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/adminAuth", () => ({ verifyAdminToken: vi.fn(async () => ({ email: "admin@test" })) }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));

import { PATCH } from "./route";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { makeSupabaseMock } from "@/lib/test-helpers/supabase-mock";

const req = (body) => new Request("http://x/api/admin/early-access", { method: "PATCH", body: JSON.stringify(body) });

describe("PATCH /api/admin/early-access（觀看權限覆寫）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("email 含底線時 ilike 用跳脫後的樣式（_ 是 LIKE 單字元萬用，不跳脫會改到 axb@x.com）", async () => {
    const sb = makeSupabaseMock(() => ({ data: [{ id: "e1" }], error: null }));
    getSupabaseAdmin.mockReturnValue(sb);
    const res = await PATCH(req({ email: "a_b@x.com", override: "early" }));
    expect(res.status).toBe(200);
    const upd = sb.calls.find((c) => c.table === "enrollments");
    expect(sb.arg(upd, "ilike")).toBe("email");
    expect(sb.arg(upd, "ilike", 1)).toBe("a\\_b@x.com");
    expect(logAudit).toHaveBeenCalledWith(sb, expect.objectContaining({ action: "student.early_override", targetId: "a_b@x.com" }));
  });

  it("沒命中任何開通列 → 404", async () => {
    getSupabaseAdmin.mockReturnValue(makeSupabaseMock(() => ({ data: [], error: null })));
    expect((await PATCH(req({ email: "x@x.com", override: null }))).status).toBe(404);
  });

  it("override 不合法 → 400", async () => {
    getSupabaseAdmin.mockReturnValue(makeSupabaseMock(() => ({ data: [], error: null })));
    expect((await PATCH(req({ email: "x@x.com", override: "vip" }))).status).toBe(400);
  });
});
