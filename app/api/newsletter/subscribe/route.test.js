import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/rate-limit", () => ({ createDistributedLimiter: () => async () => ({ allowed: globalThis.__rlAllowed !== false }), clientIp: () => "1.1.1.1" }));
vi.mock("@/lib/brevo-contacts", () => ({ addLeadContact: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/brevo-email", () => ({ sendNewsletterEmail: vi.fn(async () => ({ success: true })) }));

import { POST } from "./route";
import { addLeadContact } from "@/lib/brevo-contacts";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendNewsletterEmail } from "@/lib/brevo-email";

const post = (body) => POST(new Request("http://x/api/newsletter/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

describe("POST /api/newsletter/subscribe（首頁留信箱）", () => {
  beforeEach(() => { vi.clearAllMocks(); globalThis.__rlAllowed = true; getSupabaseAdmin.mockReturnValue(null); sendNewsletterEmail.mockResolvedValue({ success: true }); process.env.SUPABASE_SERVICE_ROLE_KEY = "s"; });

  it("email 格式錯 → 400 invalid_email，不打 Brevo", async () => {
    const r = await post({ email: "nope", consent: true });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("invalid_email");
    expect(addLeadContact).not.toHaveBeenCalled();
  });

  it("沒勾同意 → 400 consent_required", async () => {
    const r = await post({ email: "a@x.com" });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("consent_required");
    expect(addLeadContact).not.toHaveBeenCalled();
  });

  it("限流 → 429", async () => {
    globalThis.__rlAllowed = false;
    expect((await post({ email: "a@x.com", consent: true })).status).toBe(429);
  });

  it("壞 JSON → 400", async () => {
    const r = await POST(new Request("http://x/", { method: "POST", body: "{" }));
    expect(r.status).toBe(400);
  });

  it("成功：email 正規化；屬性含來源／同意時間／UTM（只收白名單、截長 100）", async () => {
    addLeadContact.mockResolvedValue({ ok: true });
    const r = await post({ email: " A@X.com ", consent: true, attribution: { utm_source: "ig", utm_medium: "cpc", utm_campaign: "x".repeat(200), fbclid: "zzz", hack: "1" } });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, trialSent: true });
    const arg = addLeadContact.mock.calls[0][0];
    expect(arg.email).toBe("a@x.com");
    expect(arg.attributes.SOURCE).toBe("website");
    expect(arg.attributes.CONSENT_AT).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(arg.attributes.UTM_SOURCE).toBe("ig");
    expect(arg.attributes.UTM_MEDIUM).toBe("cpc");
    expect(arg.attributes.UTM_CAMPAIGN).toHaveLength(100);
    expect(arg.attributes).not.toHaveProperty("HACK");
    expect(arg.attributes).not.toHaveProperty("FBCLID");
  });

  it("沒有 UTM 也能訂閱（attribution 缺／非物件都忽略）", async () => {
    addLeadContact.mockResolvedValue({ ok: true });
    expect((await post({ email: "a@x.com", consent: true, attribution: "junk" })).status).toBe(200);
    expect(addLeadContact.mock.calls[0][0].attributes).not.toHaveProperty("UTM_SOURCE");
  });

  it("Brevo 未設定 → 503；Brevo 失敗 → 502", async () => {
    addLeadContact.mockResolvedValueOnce({ ok: false, error: "missing_brevo_config" });
    expect((await post({ email: "a@x.com", consent: true })).status).toBe(503);
    addLeadContact.mockResolvedValueOnce({ ok: false, error: "brevo_500" });
    expect((await post({ email: "a@x.com", consent: true })).status).toBe(502);
  });

  it("重新訂閱 → 從退訂名單移除該 email（best-effort，DB 出錯仍回 200）", async () => {
    addLeadContact.mockResolvedValue({ ok: true });
    const calls = [];
    const q = { delete() { calls.push("delete"); return q; }, eq(f, v) { calls.push(["eq", f, v]); return Promise.resolve({ error: null }); } };
    getSupabaseAdmin.mockReturnValue({ from: (t) => { calls.push(["from", t]); return q; } });
    expect((await post({ email: "a@x.com", consent: true })).status).toBe(200);
    expect(calls).toEqual([["from", "newsletter_unsubscribes"], "delete", ["eq", "email", "a@x.com"]]);
    getSupabaseAdmin.mockReturnValue({ from: () => { throw new Error("db down"); } });
    expect((await post({ email: "a@x.com", consent: true })).status).toBe(200);
  });

  it("加入名單成功後寄「免費試看」信：收件人＝正規化 email、kind=trial、內含專屬 /trial 連結", async () => {
    addLeadContact.mockResolvedValue({ ok: true });
    await post({ email: "A@x.com", consent: true });
    expect(sendNewsletterEmail).toHaveBeenCalledTimes(1);
    const arg = sendNewsletterEmail.mock.calls[0][0];
    expect(arg.to).toBe("a@x.com");
    expect(arg.kind).toBe("trial");
    expect(arg.html).toContain("/trial?e=a%40x.com&amp;t=");
  });

  it("試看信寄失敗 → 仍 200（名單已進），trialSent=false 讓前端提示", async () => {
    addLeadContact.mockResolvedValue({ ok: true });
    sendNewsletterEmail.mockResolvedValueOnce({ success: false, error: "brevo_500" });
    const r = await post({ email: "a@x.com", consent: true });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, trialSent: false });
  });

  it("Brevo 名單失敗就不寄試看信", async () => {
    addLeadContact.mockResolvedValueOnce({ ok: false, error: "brevo_500" });
    await post({ email: "a@x.com", consent: true });
    expect(sendNewsletterEmail).not.toHaveBeenCalled();
  });
});
