import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn(() => ({})) }));
const runOpsReport = vi.fn();
vi.mock("@/lib/ops-report/run", () => ({ runOpsReport: (...a) => runOpsReport(...a) }));
import { GET } from "./route";

const req = (auth) => new Request("http://x/api/cron/ops-report", { headers: auth ? { authorization: auth } : {} });

describe("GET /api/cron/ops-report", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("CRON_SECRET", "s"); vi.stubEnv("ANTHROPIC_API_KEY", "k"); });
  afterEach(() => vi.unstubAllEnvs());
  it("沒帶或錯的 Bearer → 401", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
  });
  it("未設 ANTHROPIC_API_KEY → 200 skipped，不跑", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const r = await GET(req("Bearer s"));
    expect(await r.json()).toEqual({ ok: true, skipped: "no_api_key" });
    expect(runOpsReport).not.toHaveBeenCalled();
  });
  it("正常 → 呼叫 runOpsReport（triggeredBy=cron）並回 ok", async () => {
    runOpsReport.mockResolvedValue({ row: { id: "r1" } });
    const r = await GET(req("Bearer s"));
    expect(runOpsReport.mock.calls[0][1]).toMatchObject({ triggeredBy: "cron" });
    expect(await r.json()).toMatchObject({ ok: true, id: "r1" });
  });
});
