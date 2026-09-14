import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/adminAuth", () => ({ verifyAdminToken: vi.fn(async () => ({ email: "admin@test" })) }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));

import { POST } from "./route";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { makeSupabaseMock } from "@/lib/test-helpers/supabase-mock";

const req = (body) => new Request("http://x/api/admin/comment-replies", { method: "POST", body: JSON.stringify(body) });

describe("POST /api/admin/comment-replies（後台回覆留言）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("缺 comment_id 或回覆空白 → 400、不寫 DB", async () => {
    const sb = makeSupabaseMock(() => ({ data: null, error: null }));
    getSupabaseAdmin.mockReturnValue(sb);
    expect((await POST(req({ admin_content: "hi" }))).status).toBe(400);
    expect((await POST(req({ comment_id: "c1", admin_content: "   " }))).status).toBe(400);
    expect(sb.calls).toHaveLength(0);
  });

  it("正常回覆：寫入、標 replied、留稽核 comment.reply", async () => {
    const sb = makeSupabaseMock((table) => ({ data: table === "comment_replies" ? { id: "r1" } : null, error: null }));
    getSupabaseAdmin.mockReturnValue(sb);
    const res = await POST(req({ comment_id: "c1", admin_content: "謝謝提問" }));
    expect(res.status).toBe(200);
    expect(sb.calls.map((c) => c.table)).toEqual(["comment_replies", "comments"]);
    expect(logAudit).toHaveBeenCalledWith(sb, expect.objectContaining({ action: "comment.reply", targetId: "c1", meta: { reply_id: "r1" } }));
  });
});
