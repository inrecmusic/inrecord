import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/adminAuth", () => ({ verifyAdminToken: vi.fn(async () => ({ email: "admin@test" })) }));

import { GET } from "./route";
import { verifyAdminToken } from "@/lib/adminAuth";

const req = () => new Request("http://x/api/admin/bunny-usage");
const okFetch = (body, status = 200) =>
  vi.fn(async () => ({ ok: status < 400, status, json: async () => body }));

describe("GET /api/admin/bunny-usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("BUNNY_ACCOUNT_API_KEY", "");
    vi.stubEnv("BUNNY_API_KEY", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("未授權回 401", async () => {
    verifyAdminToken.mockResolvedValueOnce(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("沒設金鑰回 ok:false missing_bunny_config，不打 Bunny", async () => {
    const f = okFetch({});
    vi.stubGlobal("fetch", f);
    const body = await (await GET(req())).json();
    expect(body).toMatchObject({ ok: false, error: "missing_bunny_config" });
    expect(f).not.toHaveBeenCalled();
  });

  it("優先用帳號金鑰打 api.bunny.net/billing，回整理後的本月費用與流量", async () => {
    vi.stubEnv("BUNNY_ACCOUNT_API_KEY", "acct-key");
    vi.stubEnv("BUNNY_API_KEY", "lib-key");
    const f = okFetch({ Balance: 46.8, ThisMonthCharges: 3.21, MonthlyChargesStorage: 0.5, MonthlyBandwidthUsed: 642_000_000_000 });
    vi.stubGlobal("fetch", f);

    const body = await (await GET(req())).json();

    expect(f).toHaveBeenCalledWith(
      "https://api.bunny.net/billing",
      expect.objectContaining({ headers: expect.objectContaining({ AccessKey: "acct-key" }) })
    );
    expect(body).toMatchObject({ ok: true, thisMonthCharges: 3.21, balance: 46.8, bandwidthGB: 642, storageCharges: 0.5 });
    expect(typeof body.fetchedAt).toBe("string");
  });

  it("Bunny 回非 2xx → 502 並帶狀態碼", async () => {
    vi.stubEnv("BUNNY_API_KEY", "lib-key");
    vi.stubGlobal("fetch", okFetch({}, 401));
    const res = await GET(req());
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ ok: false, error: "bunny_401" });
  });
});
