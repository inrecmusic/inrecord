import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/adminAuth", () => ({ verifyAdminToken: vi.fn(async () => ({ email: "admin@test" })) }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/fulfillment-grant", () => ({ grantAccess: vi.fn(async () => ({ ok: true, errors: [] })) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));
// selectAll：模擬分頁查詢——執行 build() 記錄篩選條件，orders 依 .in 限縮
vi.mock("@/lib/supabase-paginate", () => ({
  selectAll: vi.fn(async (_sb, table, build) => {
    const rec = { in: null };
    const q = new Proxy({}, { get(_, m) { return (...a) => { if (m === "in") rec.in = a[1]; return q; }; } });
    build(q);
    if (table === "enrollments") return ENROLLED.map((email) => ({ email }));
    return ORDERS.filter((o) => (rec.in ? rec.in.includes(o.id) : true));
  }),
}));

import { POST } from "./route";
import { verifyAdminToken } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { grantAccess } from "@/lib/fulfillment-grant";
import { makeSupabaseMock } from "@/lib/test-helpers/supabase-mock";

// 候選：兩筆官網已付款（一筆已開通）
const ORDERS = [
  { id: "o1", email: "a@x.com", plan: "bundle", source: "payuni", status: "paid" },
  { id: "o2", email: "b@x.com", plan: "course", source: "payuni", status: "paid" },
];
const ENROLLED = ["b@x.com"];

const req = (body) => new Request("http://x/api/admin/grant-orders", { method: "POST", body: body === undefined ? "" : JSON.stringify(body) });

describe("POST /api/admin/grant-orders（後台開通官網已付款單）", () => {
  let sb;
  beforeEach(() => {
    vi.clearAllMocks();
    sb = makeSupabaseMock(() => ({ data: null, error: null }));
    getSupabaseAdmin.mockReturnValue(sb);
  });

  it("未授權 → 401", async () => {
    verifyAdminToken.mockResolvedValueOnce(null);
    expect((await POST(req({}))).status).toBe(401);
  });

  it("不帶 ids → 開通全部「未開通」的官網單；已開通的跳過；每筆寫 access_granted_at", async () => {
    const body = await (await POST(req({}))).json();
    expect(body).toMatchObject({ ok: true, granted: 1, failed: 0 });
    expect(grantAccess).toHaveBeenCalledTimes(1);
    expect(grantAccess.mock.calls[0][1]).toMatchObject({ id: "o1", email: "a@x.com" });
    const upd = sb.calls.find((c) => c.table === "orders" && sb.has(c, "update"));
    expect(sb.arg(upd, "update")).toHaveProperty("access_granted_at");
    expect(sb.arg(upd, "eq")).toBe("id");
  });

  it("ids 為空陣列 → 不開通任何一筆（避免誤開全部）", async () => {
    const body = await (await POST(req({ ids: [] }))).json();
    expect(body).toMatchObject({ ok: true, granted: 0 });
    expect(grantAccess).not.toHaveBeenCalled();
  });

  it("開通失敗 → 計入 failed 並回報原因，整體仍 200", async () => {
    grantAccess.mockResolvedValueOnce({ ok: false, errors: ["enrollment_insert_failed"] });
    const body = await (await POST(req({ ids: ["o1"] }))).json();
    expect(body).toMatchObject({ ok: true, granted: 0, failed: 1 });
    expect(body.errors[0]).toContain("a@x.com");
  });
});
