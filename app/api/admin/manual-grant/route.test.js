import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/adminAuth", () => ({ verifyAdminToken: vi.fn(async () => ({ email: "admin@test" })) }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/fulfillment-grant", () => ({ grantAccess: vi.fn(async () => ({ ok: true, errors: [] })) }));
vi.mock("@/lib/brevo-email", () => ({ sendPurchaseEmail: vi.fn(async () => ({ success: true })) }));
vi.mock("@/lib/sale", () => ({ getSaleSettings: vi.fn(async () => ({})), isPresale: vi.fn(() => false) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));

import { POST } from "./route";
import { verifyAdminToken } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { grantAccess } from "@/lib/fulfillment-grant";
import { sendPurchaseEmail } from "@/lib/brevo-email";
import { makeSupabaseMock } from "@/lib/test-helpers/supabase-mock";

const req = (body) => new Request("http://x/api/admin/manual-grant", { method: "POST", body: JSON.stringify(body) });

// state.dupOrder / state.dupEnrollment 控制「去重守衛」查到什麼；insert 一律回 id=o1
function makeDb(state = {}) {
  return makeSupabaseMock((table, ops) => {
    const has = (m) => ops.some((o) => o.m === m);
    if (has("insert")) return { data: { id: "o1" }, error: null };
    if (has("maybeSingle")) return { data: table === "orders" ? state.dupOrder || null : state.dupEnrollment || null, error: null };
    return { data: null, error: null };
  });
}

describe("POST /api/admin/manual-grant（後台手動開通）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("未授權 → 401", async () => {
    verifyAdminToken.mockResolvedValueOnce(null);
    getSupabaseAdmin.mockReturnValue(makeDb());
    expect((await POST(req({ email: "a@x.com" }))).status).toBe(401);
  });

  it("Email 格式不合法 → 400", async () => {
    getSupabaseAdmin.mockReturnValue(makeDb());
    const res = await POST(req({ email: "not-an-email", grant: true }));
    expect(res.status).toBe(400);
  });

  it("該 email 已開通 → 視為重複請求：不建單、不開通、不寄信，回 duplicate", async () => {
    const sb = makeDb({ dupEnrollment: { id: "e1" } });
    getSupabaseAdmin.mockReturnValue(sb);
    const body = await (await POST(req({ email: "a@x.com", plan: "bundle", grant: true, sendEmail: true }))).json();
    expect(body).toMatchObject({ ok: true, duplicate: true, granted: false, alreadyGranted: true });
    expect(grantAccess).not.toHaveBeenCalled();
    expect(sendPurchaseEmail).not.toHaveBeenCalled();
    expect(sb.calls.some((c) => sb.has(c, "insert"))).toBe(false);
  });

  it("有舊的 manual 單、但 enrollment 已被撤銷（例如標記退款後）→ 要能重新開通，不能當成重複請求", async () => {
    const sb = makeDb({ dupOrder: { id: "old", presale_email_sent_at: null, email_error: null } }); // 沒有 dupEnrollment
    getSupabaseAdmin.mockReturnValue(sb);
    const body = await (await POST(req({ email: "a@x.com", plan: "bundle", grant: true, sendEmail: false }))).json();
    expect(body).toMatchObject({ ok: true, granted: true, alreadyGranted: false });
    expect(grantAccess).toHaveBeenCalledTimes(1);
  });

  it("只寄信模式（grant=false）：已有 manual 單就不重複寄，維持去重", async () => {
    const sb = makeDb({ dupOrder: { id: "old", presale_email_sent_at: "2026-09-01T00:00:00Z", email_error: null } });
    getSupabaseAdmin.mockReturnValue(sb);
    const body = await (await POST(req({ email: "a@x.com", plan: "bundle", grant: false, sendEmail: true }))).json();
    expect(body).toMatchObject({ ok: true, duplicate: true, emailSent: true });
    expect(sendPurchaseEmail).not.toHaveBeenCalled();
  });

  it("新 email 開通 → 建 source=manual、amount 0、status=paid 的訂單，再 grantAccess；不勾寄信就不寄", async () => {
    const sb = makeDb();
    getSupabaseAdmin.mockReturnValue(sb);
    const body = await (await POST(req({ email: "New@X.com", plan: "bundle", grant: true, sendEmail: false }))).json();
    expect(body).toMatchObject({ ok: true, granted: true, mode: "grant", emailSent: false });
    const ins = sb.calls.find((c) => c.table === "orders" && sb.has(c, "insert"));
    expect(sb.arg(ins, "insert")).toMatchObject({ email: "new@x.com", plan: "bundle", amount: 0, status: "paid", source: "manual" });
    expect(grantAccess).toHaveBeenCalledWith(sb, { id: "o1", email: "new@x.com", plan: "bundle" });
    expect(sendPurchaseEmail).not.toHaveBeenCalled();
  });

  it("開通失敗 → 刪掉剛建的孤兒訂單、回 500（避免去重守衛下次誤判已處理）", async () => {
    const sb = makeDb();
    getSupabaseAdmin.mockReturnValue(sb);
    grantAccess.mockResolvedValueOnce({ ok: false, errors: ["boom"] });
    const res = await POST(req({ email: "a@x.com", plan: "course", grant: true }));
    expect(res.status).toBe(500);
    const del = sb.calls.find((c) => c.table === "orders" && sb.has(c, "delete"));
    expect(del).toBeTruthy();
    expect(sb.arg(del, "eq", 1)).toBe("o1");
  });

  it("勾寄信 → 寄預購／開課信，成功時把 presale_email_sent_at 寫回訂單", async () => {
    const sb = makeDb();
    getSupabaseAdmin.mockReturnValue(sb);
    const body = await (await POST(req({ email: "a@x.com", plan: "course", grant: true, sendEmail: true }))).json();
    expect(body).toMatchObject({ ok: true, granted: true, emailSent: true, emailError: null });
    expect(sendPurchaseEmail).toHaveBeenCalledWith(expect.objectContaining({ email: "a@x.com", plan: "course" }));
    const upd = sb.calls.find((c) => c.table === "orders" && sb.has(c, "update"));
    expect(sb.arg(upd, "update")).toHaveProperty("presale_email_sent_at");
  });
});
