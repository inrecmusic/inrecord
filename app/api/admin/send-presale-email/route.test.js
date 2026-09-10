import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/adminAuth", () => ({ verifyAdminToken: vi.fn(async () => ({ email: "admin@test" })) }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/brevo-email", () => ({ sendPurchaseEmail: vi.fn(async () => ({ success: true })) }));
vi.mock("@/lib/sale", () => ({ getSaleSettings: vi.fn(async () => ({})), isPresale: vi.fn(() => true) }));
vi.mock("@/lib/admin-leads", () => ({ fetchPendingLeads: vi.fn(async () => ({ data: ORDERS, error: null })) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));

import { POST } from "./route";
import { verifyAdminToken } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendPurchaseEmail } from "@/lib/brevo-email";
import { fetchPendingLeads } from "@/lib/admin-leads";
import { makeSupabaseMock } from "@/lib/test-helpers/supabase-mock";

const ORDERS = [
  { id: "o1", email: "a@x.com", plan: "bundle", plan_label: "課程包", mer_trade_no: "W1" },
  { id: "o2", email: "b@x.com", plan: "course", plan_label: "課程", mer_trade_no: "W2" },
];
const req = () => new Request("http://x/api/admin/send-presale-email", { method: "POST", body: "{}" });

// contested：模擬「另一個請求已搶走」的訂單（claim 回 0 列）
function makeSb(state) {
  return makeSupabaseMock((table, ops) => {
    if (table !== "orders") return { data: null, error: null };
    const id = ops.find((o) => o.m === "eq" && o.args[0] === "id")?.args[1];
    const patch = ops.find((o) => o.m === "update")?.args[0] || {};
    const isClaim = ops.some((o) => o.m === "is" && o.args[0] === "presale_email_sent_at");
    if (isClaim) {
      if (state.contested.has(id)) return { data: null, error: null };
      state.claimed.push(id);
      return { data: { id }, error: null };
    }
    state.updates.push({ id, patch });
    return { data: null, error: null };
  });
}

describe("POST /api/admin/send-presale-email（後台批次寄預購信）", () => {
  let state;
  beforeEach(() => {
    vi.clearAllMocks();
    state = { claimed: [], contested: new Set(), updates: [] };
    getSupabaseAdmin.mockReturnValue(makeSb(state));
  });

  it("未授權 → 401", async () => {
    verifyAdminToken.mockResolvedValueOnce(null);
    expect((await POST(req())).status).toBe(401);
  });

  it("先搶佔旗標再寄信：每筆都 claim 成功才寄", async () => {
    const body = await (await POST(req())).json();
    expect(body).toMatchObject({ ok: true, sent: 2, failed: 0, skipped: 0 });
    expect(state.claimed).toEqual(["o1", "o2"]);
    expect(sendPurchaseEmail).toHaveBeenCalledTimes(2);
    expect(state.updates).toEqual([]); // 沒有失敗 → 不需清回旗標
  });

  it("併發／重試時搶不到旗標 → 跳過不寄（不會寄出第二封）", async () => {
    state.contested.add("o1");
    const body = await (await POST(req())).json();
    expect(body).toMatchObject({ sent: 1, skipped: 1 });
    expect(sendPurchaseEmail.mock.calls.map((c) => c[0].email)).toEqual(["b@x.com"]);
  });

  it("寄送失敗 → 旗標清回 null＋寫 email_error，下次可重寄", async () => {
    sendPurchaseEmail.mockResolvedValueOnce({ success: false, error: "brevo_500" });
    const body = await (await POST(req())).json();
    expect(body).toMatchObject({ sent: 1, failed: 1 });
    expect(state.updates).toEqual([{ id: "o1", patch: { presale_email_sent_at: null, email_error: "brevo_500" } }]);
  });

  it("缺 Brevo 設定（skipped）→ 旗標清回 null、不寫 email_error", async () => {
    sendPurchaseEmail.mockResolvedValueOnce({ success: false, skipped: true, error: "missing_brevo_config" });
    await POST(req());
    expect(state.updates).toEqual([{ id: "o1", patch: { presale_email_sent_at: null } }]);
  });

  it("撈名單失敗 → 500，不寄任何信", async () => {
    fetchPendingLeads.mockResolvedValueOnce({ data: null, error: { message: "db down" } });
    expect((await POST(req())).status).toBe(500);
    expect(sendPurchaseEmail).not.toHaveBeenCalled();
  });
});
