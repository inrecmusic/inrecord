import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// 推成 Brevo 範本：主旨與內文的價格佔位符都要在推送當下代入（Brevo 範本是靜態的）
const SETTINGS = {
  list_price: { bundle: 13800 },
  waves: [
    { starts_at: "2026-10-01T16:00:00Z", ends_at: "2026-10-08T16:00:00Z", prices: { bundle: 4549 } },
    { starts_at: "2026-10-08T16:00:00Z", ends_at: "2026-10-15T16:00:00Z", prices: { bundle: 4799 } },
  ],
};

vi.mock("@/lib/adminAuth", () => ({ verifyAdminToken: vi.fn(async () => ({ email: "admin@test" })) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/sale", async (orig) => ({ ...(await orig()), getSaleSettings: vi.fn(async () => SETTINGS) }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { subject: "《從零開始學鋼琴》限時優惠 {{折數}}", body_md: "目前 **{{目前售價}}**" },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

import { POST } from "./route";

describe("POST /api/admin/newsletter/to-brevo", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: Date.parse("2026-10-03T12:00:00Z"), toFake: ["Date"] });
    vi.stubEnv("BREVO_API_KEY", "k");
    vi.stubEnv("BREVO_SENDER_EMAIL", "support@x.com");
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("主旨與內文的佔位符都代入當下價格再推（範本主旨、信件頁首不會露出 {{折數}}）", async () => {
    const calls = [];
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      calls.push({ url, init });
      if (!init?.method) return { ok: true, status: 200, json: async () => ({ templates: [] }) }; // 找同名範本
      return { ok: true, status: 201, json: async () => ({ id: 99 }) };
    }));
    const res = await POST(new Request("http://x/api/admin/newsletter/to-brevo", { method: "POST", body: JSON.stringify({ id: "promo" }) }));
    expect((await res.json()).templateId).toBe(99);
    const tpl = JSON.parse(calls.find((c) => c.init?.method === "POST").init.body);
    expect(tpl.subject).toBe("《從零開始學鋼琴》限時優惠 3.2 折");
    expect(tpl.htmlContent).not.toContain("{{折數}}");
    expect(tpl.htmlContent).toContain("限時優惠 3.2 折</h1>");
    expect(tpl.htmlContent).toContain("NT$4,549");
    expect(tpl.templateName).toBe("InRecord｜promo");
  });
});
