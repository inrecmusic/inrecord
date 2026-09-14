import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/adminAuth", () => ({ verifyAdminToken: vi.fn(async () => ({ email: "admin@test" })) }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));

import { DELETE } from "./route";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { makeSupabaseMock } from "@/lib/test-helpers/supabase-mock";

describe("DELETE /api/admin/unit-comments（刪學員留言）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("缺 id → 400、不打 DB", async () => {
    const sb = makeSupabaseMock(() => ({ data: null, error: null }));
    getSupabaseAdmin.mockReturnValue(sb);
    const res = await DELETE(new Request("http://x/api/admin/unit-comments", { method: "DELETE" }));
    expect(res.status).toBe(400);
    expect(sb.calls).toHaveLength(0);
  });

  it("正常刪除：eq id 並留稽核 comment.delete", async () => {
    const sb = makeSupabaseMock(() => ({ data: null, error: null }));
    getSupabaseAdmin.mockReturnValue(sb);
    const res = await DELETE(new Request("http://x/api/admin/unit-comments?id=c9", { method: "DELETE" }));
    expect(res.status).toBe(200);
    const del = sb.calls.find((c) => c.table === "comments");
    expect(sb.has(del, "delete")).toBe(true);
    expect(sb.arg(del, "eq", 1)).toBe("c9");
    expect(logAudit).toHaveBeenCalledWith(sb, expect.objectContaining({ action: "comment.delete", targetId: "c9" }));
  });
});
