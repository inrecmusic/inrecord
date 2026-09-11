import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/adminAuth", () => ({ verifyAdminToken: vi.fn(async () => ({ email: "admin@test" })) }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/brevo-email", () => ({ sendNewsletterEmail: vi.fn(async () => ({ success: true })) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));

import { POST } from "./route";
import { verifyAdminToken } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendNewsletterEmail } from "@/lib/brevo-email";
import { makeSupabaseMock } from "@/lib/test-helpers/supabase-mock";

const req = (body) => new Request("http://x/api/admin/bulk-followup", { method: "POST", body: JSON.stringify(body) });
const payload = { emails: ["a@x.com", "b@x.com"], subject: "還沒完成付款", bodyMd: "快來付款" };

// state：unsubscribed=退訂名單、claimed=已佔位的 email、unsubError=讀退訂名單丟錯
function makeSb(state) {
  return makeSupabaseMock((table, ops) => {
    if (table === "newsletter_unsubscribes") {
      if (state.unsubError) return { data: null, error: { message: "db down" } };
      return { data: state.unsubscribed.map((email) => ({ email })), error: null };
    }
    if (table === "newsletter_sends") {
      const ins = ops.find((o) => o.m === "insert");
      if (ins) {
        const email = ins.args[0].email;
        if (state.claimed.has(email)) return { error: { code: "23505" } };
        state.claimed.add(email);
        return { error: null };
      }
      if (ops.some((o) => o.m === "delete")) {
        state.released.push(ops.find((o) => o.m === "eq" && o.args[0] === "email")?.args[1]);
        return { error: null };
      }
    }
    return { data: null, error: null };
  });
}

describe("POST /api/admin/bulk-followup（批次追單信）", () => {
  let state;
  beforeEach(() => {
    vi.clearAllMocks();
    state = { unsubscribed: [], claimed: new Set(), released: [], unsubError: false };
    getSupabaseAdmin.mockReturnValue(makeSb(state));
  });

  it("未授權 → 401", async () => {
    verifyAdminToken.mockResolvedValueOnce(null);
    expect((await POST(req(payload))).status).toBe(401);
  });

  it("正常寄送：每封都帶收件人專屬退訂連結（內文按鈕＋List-Unsubscribe 標頭）", async () => {
    const body = await (await POST(req(payload))).json();
    expect(body).toMatchObject({ ok: true, total: 2, sent: 2, skipped: 0, unsubscribed: 0 });
    expect(sendNewsletterEmail).toHaveBeenCalledTimes(2);
    const first = sendNewsletterEmail.mock.calls[0][0];
    expect(first.unsubscribeUrl).toContain("/unsubscribe?e=a%40x.com&t=");
    expect(first.html).toContain(">取消訂閱<");
    // 每位收件人的簽章連結不同（不可共用一條）
    expect(sendNewsletterEmail.mock.calls[1][0].unsubscribeUrl).not.toBe(first.unsubscribeUrl);
  });

  it("已按過取消訂閱的人不再收到追單信", async () => {
    state.unsubscribed = ["b@x.com"];
    const body = await (await POST(req(payload))).json();
    expect(body).toMatchObject({ sent: 1, unsubscribed: 1 });
    expect(sendNewsletterEmail.mock.calls.map((c) => c[0].to)).toEqual(["a@x.com"]);
  });

  it("同一封內容重複點擊 → 佔位撞唯一鍵，跳過不重寄", async () => {
    state.claimed.add("a@x.com"); // 前一次請求已佔位
    const body = await (await POST(req(payload))).json();
    expect(body).toMatchObject({ sent: 1, skipped: 1 });
    expect(sendNewsletterEmail.mock.calls.map((c) => c[0].to)).toEqual(["b@x.com"]);
  });

  it("寄送失敗 → 退回佔位（下次可重寄）並列入 failed", async () => {
    sendNewsletterEmail.mockResolvedValueOnce({ success: false, error: "brevo_500" });
    const body = await (await POST(req(payload))).json();
    expect(body).toMatchObject({ sent: 1 });
    expect(body.failed).toEqual([{ to: "a@x.com", error: "brevo_500" }]);
    expect(state.released).toEqual(["a@x.com"]);
  });

  it("退訂名單讀不到 → 整批中止（fail-closed），一封都不寄", async () => {
    state.unsubError = true;
    const res = await POST(req(payload));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("unsubscribe_list_unavailable");
    expect(sendNewsletterEmail).not.toHaveBeenCalled();
  });

  it("主旨或內文為空 → 400，不寄", async () => {
    expect((await POST(req({ ...payload, subject: " " }))).status).toBe(400);
    expect(sendNewsletterEmail).not.toHaveBeenCalled();
  });
});
