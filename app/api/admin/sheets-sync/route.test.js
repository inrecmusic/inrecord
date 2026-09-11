import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/adminAuth", () => ({ verifyAdminToken: vi.fn(async () => ({ email: "admin@test" })) }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn(() => makeSupabase()) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));

import { GET, POST } from "./route";
import { verifyAdminToken } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { ORDER_FIELDS, SHEET_NAME } from "@/lib/sheets-sync";

// 撈到的訂單與被記下的查詢條件（測試檢查有沒有正確套日期區間）
let ORDERS = [];
let QUERY = {};

function makeSupabase() {
  const chain = {
    select: vi.fn(() => chain),
    order: vi.fn(() => chain),
    gte: vi.fn((c, v) => { QUERY.gte = v; return chain; }),
    lte: vi.fn((c, v) => { QUERY.lte = v; return chain; }),
    range: vi.fn(async () => ({ data: ORDERS, error: null })),
    insert: vi.fn(async () => ({ error: null })),
  };
  return { from: vi.fn(() => chain) };
}

const get = () => new Request("http://x/api/admin/sheets-sync");
const post = (body) =>
  new Request("http://x/api/admin/sheets-sync", { method: "POST", body: JSON.stringify(body ?? {}) });

const sheetOk = (body = { ok: true, inserted: 2, updated: 1 }, status = 200) =>
  vi.fn(async () => ({ ok: status < 400, status, json: async () => body }));

const ORDER = {
  mer_trade_no: "INREC1", created_at: "2026-08-10T02:00:00Z", updated_at: "2026-08-10T02:05:00Z",
  fulfilled_at: "2026-08-10T02:05:00Z", email: "a@x.com", grant_email: null, buyer_name: "小明",
  plan: "bundle", plan_label: "學琴全攻略", amount: 3999, coupon_code: null, pay_type: "1",
  status: "paid", invoice_no: "AA1", source: "payuni",
};

describe("/api/admin/sheets-sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ORDERS = [ORDER];
    QUERY = {};
    verifyAdminToken.mockResolvedValue({ email: "admin@test" });
    getSupabaseAdmin.mockImplementation(() => makeSupabase());
    vi.stubEnv("SHEETS_WEBHOOK_URL", "https://script.google.com/macros/s/abc/exec");
    vi.stubEnv("SHEETS_WEBHOOK_SECRET", "s3cret");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T01:00:00Z")); // 台灣 9/2 → 預設上個月＝八月
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("未授權：GET / POST 皆回 401，且不打 Apps Script", async () => {
    verifyAdminToken.mockResolvedValue(null);
    const f = sheetOk();
    vi.stubGlobal("fetch", f);
    expect((await GET(get())).status).toBe(401);
    expect((await POST(post())).status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });

  it("GET 回設定狀態與預設區間（上個月）", async () => {
    const body = await (await GET(get())).json();
    expect(body).toMatchObject({ ok: true, configured: true, sheet: SHEET_NAME, from: "2026-08-01", to: "2026-08-31" });
  });

  it("GET：env 未設時 configured:false（供按鈕顯示停用原因）", async () => {
    vi.stubEnv("SHEETS_WEBHOOK_URL", "");
    const body = await (await GET(get())).json();
    expect(body.configured).toBe(false);
  });

  it("env 未設：POST 回 503 sheets_not_configured，不打 Apps Script、不查 DB", async () => {
    vi.stubEnv("SHEETS_WEBHOOK_SECRET", "");
    const f = sheetOk();
    vi.stubGlobal("fetch", f);
    const res = await POST(post());
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "sheets_not_configured" });
    expect(f).not.toHaveBeenCalled();
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("沒帶區間：預設上個月整月，並以台灣日界換算 UTC 查詢", async () => {
    vi.stubGlobal("fetch", sheetOk());
    const body = await (await POST(post())).json();
    expect(body).toMatchObject({ ok: true, count: 1, inserted: 2, updated: 1, from: "2026-08-01", to: "2026-08-31" });
    expect(QUERY).toEqual({ gte: "2026-07-31T16:00:00.000Z", lte: "2026-08-31T15:59:59.999Z" });
  });

  it("帶區間：照指定日期查詢並回傳同一組區間", async () => {
    vi.stubGlobal("fetch", sheetOk());
    const body = await (await POST(post({ from: "2026-06-01", to: "2026-06-30" }))).json();
    expect(body).toMatchObject({ from: "2026-06-01", to: "2026-06-30" });
    expect(QUERY).toEqual({ gte: "2026-05-31T16:00:00.000Z", lte: "2026-06-30T15:59:59.999Z" });
  });

  it("只給起日：終點不設限（沿用後台日期篩選語意）", async () => {
    vi.stubGlobal("fetch", sheetOk());
    await POST(post({ from: "2026-06-01" }));
    expect(QUERY).toEqual({ gte: "2026-05-31T16:00:00.000Z" });
  });

  it("區間不合法回 400，不打 Apps Script", async () => {
    const f = sheetOk();
    vi.stubGlobal("fetch", f);
    const res = await POST(post({ from: "2026/06/01" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_range" });
    expect(f).not.toHaveBeenCalled();
  });

  it("送出的 payload 帶密鑰與訂單物件，並設逾時（合約＝docs/sheets/orders-sync.gs）", async () => {
    const f = sheetOk();
    vi.stubGlobal("fetch", f);
    await POST(post());

    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://script.google.com/macros/s/abc/exec");
    expect(init.method).toBe("POST");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const sent = JSON.parse(init.body);
    expect(sent.secret).toBe("s3cret");
    expect(sent.orders).toHaveLength(1);
    expect(Object.keys(sent.orders[0])).toEqual(ORDER_FIELDS);
    expect(sent.orders[0]).toMatchObject({
      mer_trade_no: "INREC1", created_at: "2026-08-10 10:00", paid_at: "2026-08-10 10:05",
      email: "a@x.com", name: "小明", plan: "學琴全攻略", amount: 3999, pay_type: "信用卡", status: "已付款",
    });
  });

  it("缺訂單編號的髒資料不送出，count 以實際送出筆數為準", async () => {
    ORDERS = [ORDER, { ...ORDER, mer_trade_no: null }];
    const f = sheetOk();
    vi.stubGlobal("fetch", f);
    const body = await (await POST(post())).json();
    expect(JSON.parse(f.mock.calls[0][1].body).orders).toHaveLength(1);
    expect(body.count).toBe(1);
  });

  it("Apps Script 回非 2xx → 502 sheets_request_failed（不外洩原始訊息）", async () => {
    vi.stubGlobal("fetch", sheetOk({}, 500));
    const res = await POST(post());
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "sheets_request_failed" });
  });

  it("Apps Script 連不上（逾時／網路錯誤）→ 502 sheets_request_failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("The operation was aborted due to timeout"); }));
    const res = await POST(post());
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "sheets_request_failed" });
  });

  it("Apps Script 回非 JSON → 502 sheets_bad_response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new Error("not json"); } })));
    const res = await POST(post());
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "sheets_bad_response" });
  });

  it("Apps Script 回 ok:false（密鑰不符）→ 502 sheets_rejected，帶白名單原因碼", async () => {
    vi.stubGlobal("fetch", sheetOk({ ok: false, error: "unauthorized", message: "祕密細節" }));
    const res = await POST(post());
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "sheets_rejected", reason: "unauthorized" });
  });

  it("非白名單的上游錯誤只留 server log，不回前端", async () => {
    vi.stubGlobal("fetch", sheetOk({ ok: false, error: "some_leaky_detail" }));
    expect(await (await POST(post())).json()).toEqual({ error: "sheets_rejected" });
  });

  it("成功後寫稽核紀錄", async () => {
    vi.stubGlobal("fetch", sheetOk());
    await POST(post());
    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actor: "admin@test",
        action: "order.sheets_sync",
        meta: { from: "2026-08-01", to: "2026-08-31", count: 1, inserted: 2, updated: 1 },
      })
    );
  });

  it("DB 撈取失敗 → 500 固定錯誤碼，不打 Apps Script", async () => {
    const f = sheetOk();
    vi.stubGlobal("fetch", f);
    getSupabaseAdmin.mockImplementation(() => {
      const chain = {
        select: vi.fn(() => chain), order: vi.fn(() => chain),
        gte: vi.fn(() => chain), lte: vi.fn(() => chain),
        range: vi.fn(async () => ({ data: null, error: { message: "permission denied for table orders" } })),
      };
      return { from: vi.fn(() => chain) };
    });
    const res = await POST(post());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "orders_load_failed" });
    expect(f).not.toHaveBeenCalled();
  });
});
