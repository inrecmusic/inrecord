import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/adminAuth", () => ({ verifyAdminToken: vi.fn(async () => ({ email: "admin@x.com" })) }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn(() => ({})) }));
vi.mock("@/lib/supabase-paginate", () => ({ selectAll: vi.fn() }));

import { GET } from "./route";
import { verifyAdminToken } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { selectAll } from "@/lib/supabase-paginate";
import { twDay } from "@/lib/email-stats";

const get = (qs = "") => GET(new Request(`http://x/api/admin/email-stats${qs}`));

// 可鏈式呼叫的 query 假物件，記錄 route 對 email_log 下了哪些條件
function querySpy() {
  const calls = [];
  const q = new Proxy({}, { get: (_t, name) => (...args) => { calls.push([name, ...args]); return q; } });
  return { q, calls };
}

const LOG_ROWS = [
  { to_email: "a@x.com", subject: "九月電子報", kind: "newsletter", status: "sent", created_at: "2026-09-02T12:00:00Z" },
  { to_email: "b@x.com", subject: "九月電子報", kind: "newsletter", status: "sent", created_at: "2026-09-02T12:00:01Z" },
  { to_email: "c@x.com", subject: "九月電子報", kind: "newsletter", status: "failed", created_at: "2026-09-02T12:00:02Z" },
];
const EVENTS = [
  { email: "a@x.com", event: "delivered", date: "2026-09-02T12:01:00Z" },
  { email: "b@x.com", event: "delivered", date: "2026-09-02T12:01:00Z" },
  { email: "a@x.com", event: "opened", date: "2026-09-02T14:00:00Z" },
  { email: "b@x.com", event: "loadedByProxy", date: "2026-09-02T14:00:00Z" },
];
const fetchOk = (events, status = 200) => vi.fn(async () => ({ ok: status < 400, status, json: async () => ({ events }) }));

describe("GET /api/admin/email-stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSupabaseAdmin.mockReturnValue({});
    selectAll.mockResolvedValue(LOG_ROWS);
    vi.stubEnv("BREVO_API_KEY", "");
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("未授權回 401，不碰資料庫", async () => {
    verifyAdminToken.mockResolvedValueOnce(null);
    expect((await get()).status).toBe(401);
    expect(selectAll).not.toHaveBeenCalled();
  });

  it("資料庫未設定回 503", async () => {
    getSupabaseAdmin.mockReturnValueOnce(null);
    expect((await get()).status).toBe(503);
  });

  it("開始日晚於結束日 → 400 invalid_range", async () => {
    const res = await get("?from=2026-09-10&to=2026-09-01");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_range");
  });

  it("區間超過 Brevo 的 90 天上限 → 400 並附說明", async () => {
    const res = await get("?from=2026-01-01&to=2026-09-01");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("range_too_long");
    expect(body.message).toContain("90");
  });

  it("沒帶日期＝過去 30 天（台灣時區），並以 +08:00 界定 email_log 區間、撈全類型建時間軸", async () => {
    const { q, calls } = querySpy();
    selectAll.mockImplementation(async (_sb, table, build) => { expect(table).toBe("email_log"); build(q); return LOG_ROWS; });
    const body = await (await get()).json();

    const today = twDay(new Date().toISOString());
    expect(body.to).toBe(today);
    expect(Math.round((Date.parse(`${body.to}T00:00:00Z`) - Date.parse(`${body.from}T00:00:00Z`)) / 86400000)).toBe(29);
    expect(calls).toEqual(expect.arrayContaining([
      ["gte", "created_at", `${body.from}T00:00:00+08:00`],
      ["lte", "created_at", `${body.to}T23:59:59.999+08:00`],
    ]));
  });

  it("沒設 BREVO_API_KEY：仍回寄出數，但 brevoConfigured=false、stats 留空，且完全不打 Brevo", async () => {
    const f = fetchOk(EVENTS);
    vi.stubGlobal("fetch", f);
    const body = await (await get("?from=2026-09-01&to=2026-09-03")).json();
    expect(f).not.toHaveBeenCalled();
    expect(body).toMatchObject({ ok: true, brevoConfigured: false, brevoError: null });
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ dateTW: "2026-09-02", subject: "九月電子報", sentCount: 2, failedCount: 1, stats: null });
  });

  it("有金鑰：把事件對進該組，代理載入不混進開信；查詢區間前後各墊一天", async () => {
    vi.stubEnv("BREVO_API_KEY", "key");
    const f = fetchOk(EVENTS);
    vi.stubGlobal("fetch", f);
    const body = await (await get("?from=2026-09-02&to=2026-09-02")).json();

    const url = f.mock.calls[0][0];
    expect(url).toContain("startDate=2026-09-01");
    expect(url).toContain("endDate=2026-09-03");
    expect(url).toContain("limit=5000");
    expect(f.mock.calls[0][1].headers).toMatchObject({ "api-key": "key" });
    expect(body.data[0].stats).toMatchObject({ delivered: 2, opened: 1, proxyOpened: 1, bounced: 0, unsubscribed: 0 });
    expect(body.data[0].stats.openRate).toBeCloseTo(0.5, 5);
  });

  it("續抓到回傳 0 筆才停，offset 依實際筆數遞增", async () => {
    vi.stubEnv("BREVO_API_KEY", "key");
    const page1 = Array.from({ length: 5000 }, () => ({ email: "z@x.com", event: "delivered", date: "2026-09-02T12:01:00Z" }));
    const f = vi.fn(async (url) => ({
      ok: true, status: 200,
      json: async () => ({ events: url.includes("offset=0") ? page1 : url.includes("offset=5000") ? EVENTS : [] }),
    }));
    vi.stubGlobal("fetch", f);
    const body = await (await get("?from=2026-09-02&to=2026-09-02")).json();
    expect(f).toHaveBeenCalledTimes(3); // 第三頁回 0 筆才收工
    expect(f.mock.calls[1][0]).toContain("offset=5000");
    expect(body.truncated).toBe(false);
    expect(body.data[0].stats.delivered).toBe(2); // 第一頁那位不在名單內，不該被算進來
  });

  // 這條是 9/2「寄出 88、送達只有 7」的根因：Brevo 每頁實際回傳可能少於我們要求的 limit，
  // 舊版把「短頁」當成沒有更多資料，於是只拿到最新的一批事件，愈舊的群發看起來就愈像沒人開信。
  it("Brevo 回傳的頁數比 limit 少時，不可當成抓完就停手", async () => {
    vi.stubEnv("BREVO_API_KEY", "key");
    const short = [{ email: "z@x.com", event: "delivered", date: "2026-09-02T12:01:00Z" }]; // 只有 1 筆，遠少於 limit
    const f = vi.fn(async (url) => ({
      ok: true, status: 200,
      json: async () => ({ events: url.includes("offset=0") ? short : url.includes("offset=1") ? EVENTS : [] }),
    }));
    vi.stubGlobal("fetch", f);
    const body = await (await get("?from=2026-09-02&to=2026-09-02")).json();
    expect(f.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(f.mock.calls[1][0]).toContain("offset=1");
    expect(body.data[0].stats.delivered).toBe(2); // 第二頁的事件有被抓到才算得出來
  });

  it("Brevo 回非 2xx：整支不掛，回 200＋brevoError，寄出數照常", async () => {
    vi.stubEnv("BREVO_API_KEY", "key");
    vi.stubGlobal("fetch", fetchOk([], 401));
    const res = await get("?from=2026-09-02&to=2026-09-02");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, brevoConfigured: true, brevoError: "brevo_401" });
    expect(body.data[0]).toMatchObject({ sentCount: 2, stats: null });
  });

  it("Brevo 逾時／連不上：回 brevo_unreachable，不顯示成沒有資料", async () => {
    vi.stubEnv("BREVO_API_KEY", "key");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout"); }));
    const body = await (await get("?from=2026-09-02&to=2026-09-02")).json();
    expect(body.brevoError).toBe("brevo_unreachable");
    expect(body.data[0].sentCount).toBe(2);
  });

  it("資料庫讀取失敗回 500，不外洩原始訊息", async () => {
    selectAll.mockRejectedValueOnce(new Error('relation "email_log" does not exist'));
    const res = await get("?from=2026-09-02&to=2026-09-02");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "server_error" });
  });
});
