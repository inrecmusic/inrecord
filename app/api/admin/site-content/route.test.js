import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/adminAuth", () => ({ verifyAdminToken: vi.fn(async () => ({ email: "admin@x.com" })) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));

import { PATCH } from "./route";
import { getSupabaseAdmin } from "@/lib/supabase";

const patch = (body) => PATCH(new Request("http://x/api/admin/site-content", { method: "PATCH", body: JSON.stringify(body) }));

describe("PATCH /api/admin/site-content", () => {
  let rows;
  beforeEach(() => {
    rows = [];
    getSupabaseAdmin.mockReturnValue({ from: () => ({ upsert: async (row) => { rows.push(row); return { error: null }; } }) });
  });

  it("trial_video_id：合法 Bunny GUID 可存；清空也可", async () => {
    expect((await patch({ key: "trial_video_id", body_md: "3f2b7c1e-9a0d-4c11-8b2a-0f1e2d3c4b5a" })).status).toBe(200);
    expect((await patch({ key: "trial_video_id", body_md: "" })).status).toBe(200);
    expect(rows.map((r) => r.key)).toEqual(["trial_video_id", "trial_video_id"]);
  });

  it("trial_video_id：含空白／引號／過長 → 400 invalid_body，不寫入", async () => {
    for (const bad of ["abc def", "x\"><script>", "a".repeat(65)]) {
      const r = await patch({ key: "trial_video_id", body_md: bad });
      expect(r.status).toBe(400);
      expect((await r.json()).error).toBe("invalid_body");
    }
    expect(rows).toHaveLength(0);
  });

  it("未知 key → 400 invalid_key", async () => {
    expect((await patch({ key: "hack", body_md: "x" })).status).toBe(400);
  });
});
