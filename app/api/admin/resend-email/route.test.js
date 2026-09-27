import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/adminAuth", () => ({ verifyAdminToken: vi.fn(async () => ({ email: "admin@test" })) }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/brevo-email", () => ({ sendPurchaseEmail: vi.fn(async () => ({ success: true })) }));
vi.mock("@/lib/sale", () => ({
  getSaleSettings: vi.fn(async () => ({})),
  isPresale: vi.fn(() => false),
  purchasePhaseLabel: vi.fn(() => ""),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));

import { POST } from "./route";
import { verifyAdminToken } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendPurchaseEmail } from "@/lib/brevo-email";
import { logAudit } from "@/lib/audit";
import { makeSupabaseMock } from "@/lib/test-helpers/supabase-mock";

const BASE = { id: "o1", email: "buyer@x.com", plan: "bundle", plan_label: "課程包",
               mer_trade_no: "W1", amount: 3999, created_at: "2026-09-01T00:00:00Z", coupon_code: null };
const req = () => new Request("http://x/api/admin/resend-email", { method: "POST", body: JSON.stringify({ id: "o1" }) });

function makeSb(order, state) {
  return makeSupabaseMock((table, ops) => {
    if (table !== "orders") return { data: null, error: null };
    if (ops.some((o) => o.m === "update")) {
      state.updates.push(ops.find((o) => o.m === "update").args[0]);
      return { data: null, error: null };
    }
    return { data: order, error: null };
  });
}

describe("POST /api/admin/resend-email（後台補寄開課信）", () => {
  let state;
  beforeEach(() => {
    vi.clearAllMocks();
    state = { updates: [] };
    getSupabaseAdmin.mockReturnValue(makeSb(BASE, state));
  });

  it("未授權 → 401", async () => {
    verifyAdminToken.mockResolvedValueOnce(null);
    expect((await POST(req())).status).toBe(401);
  });

  it("沒指定開通信箱 → 寄到下單信箱", async () => {
    const body = await (await POST(req())).json();
    expect(body).toMatchObject({ ok: true, sentTo: "buyer@x.com" });
    expect(sendPurchaseEmail).toHaveBeenCalledWith(expect.objectContaining({ email: "buyer@x.com" }));
  });

  it("有指定開通信箱 → 寄給實際上課的人，不是下單信箱", async () => {
    // 課程權限開在 grant_email（grantAccess 用同一個 effective email），
    // 通知寄回下單信箱的話，被指定的人永遠不知道自己有課。
    getSupabaseAdmin.mockReturnValue(makeSb({ ...BASE, grant_email: "student@x.com" }, state));
    const body = await (await POST(req())).json();
    expect(body).toMatchObject({ ok: true, sentTo: "student@x.com" });
    expect(sendPurchaseEmail).toHaveBeenCalledWith(expect.objectContaining({ email: "student@x.com" }));
    // 稽核要留下兩個信箱，事後查得出這封寄給了誰
    expect(logAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      meta: { email: "student@x.com", orderEmail: "buyer@x.com" },
    }));
  });

  it("寄送失敗 → 500＋寫 email_error", async () => {
    sendPurchaseEmail.mockResolvedValueOnce({ success: false, error: "brevo_500" });
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(state.updates.some((u) => u.email_error === "brevo_500")).toBe(true);
  });

  it("成功後清掉 email_error（告警面板不再顯示）", async () => {
    await POST(req());
    expect(state.updates.some((u) => u.email_error === null)).toBe(true);
  });

  it("兩個信箱都空 → 400，不寄信", async () => {
    getSupabaseAdmin.mockReturnValue(makeSb({ ...BASE, email: null, grant_email: null }, state));
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect(sendPurchaseEmail).not.toHaveBeenCalled();
  });
});
