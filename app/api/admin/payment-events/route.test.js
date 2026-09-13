import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/adminAuth", () => ({ verifyAdminToken: vi.fn(async () => ({ email: "admin@x.com" })) }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn(() => ({})) }));

import { GET } from "./route";
import { verifyAdminToken } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { makeSupabaseMock } from "@/lib/test-helpers/supabase-mock";

const get = (qs = "?mer_trade_no=INREC1") => GET(new Request(`http://x/api/admin/payment-events${qs}`));

const ROWS = [
  {
    id: "e2", kind: "paid", trade_status: "1", pay_type: "1", created_at: "2026-09-14T10:00:00Z",
    raw: { MerTradeNo: "INREC1", TradeStatus: "1", Installment: "3", Card4No: "4242", AuthCode: "012345" },
  },
  {
    id: "e1", kind: "other", trade_status: "0", pay_type: "1", created_at: "2026-09-14T09:00:00Z",
    raw: { MerTradeNo: "INREC1", TradeStatus: "0" },
  },
];

describe("GET /api/admin/payment-events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAdminToken.mockResolvedValue({ email: "admin@x.com" });
    getSupabaseAdmin.mockReturnValue({});
  });

  it("未登入回 401，且不碰資料庫", async () => {
    verifyAdminToken.mockResolvedValueOnce(null);
    const res = await get();
    expect(res.status).toBe(401);
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("沒帶 mer_trade_no 回 400（空白字串也算沒帶）", async () => {
    expect((await get("")).status).toBe(400);
    expect((await get("?mer_trade_no=")).status).toBe(400);
    expect((await get("?mer_trade_no=%20%20")).status).toBe(400);
    expect(await (await get("")).json()).toMatchObject({ error: "mer_trade_no_required" });
  });

  it("正常回該筆訂單的回呼（新到舊）＋解析出的卡片資訊＋原始 raw", async () => {
    const sb = makeSupabaseMock(() => ({ data: ROWS, error: null }));
    getSupabaseAdmin.mockReturnValue(sb);

    const body = await (await get()).json();

    expect(body).toMatchObject({ ok: true, tableMissing: false });
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toMatchObject({
      id: "e2", kind: "paid", trade_status: "1", pay_type: "1",
      card: { installment: 3, last4: "4242", authCode: "012345" },
    });
    expect(body.data[0].card.matchedKeys.installment).toBe("Installment");
    expect(body.data[0].raw).toEqual(ROWS[0].raw); // 原始回呼原樣附上，供人工核對欄位名
    expect(body.data[1].card.installment).toBeNull();

    // 查詢條件：只撈這筆訂單、新到舊
    const q = sb.calls.find((c) => c.table === "payment_events");
    expect(sb.arg(q, "eq", 0)).toBe("mer_trade_no");
    expect(sb.arg(q, "eq", 1)).toBe("INREC1");
    expect(sb.arg(q, "order", 1)).toMatchObject({ ascending: false });
  });

  it("表不存在（42P01）→ 回 200 + tableMissing，不可回 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getSupabaseAdmin.mockReturnValue(makeSupabaseMock(() => ({ data: null, error: { code: "42P01", message: "relation \"payment_events\" does not exist" } })));
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, tableMissing: true, data: [] });
  });

  it("PostgREST 找不到表（PGRST205 / schema cache）→ 一樣安全降級", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getSupabaseAdmin.mockReturnValue(makeSupabaseMock(() => ({ data: null, error: { code: "PGRST205", message: "Could not find the table 'public.payment_events' in the schema cache" } })));
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ tableMissing: true });
  });

  it("其他資料庫錯誤照常回 500（不要假裝成「沒啟用」）", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getSupabaseAdmin.mockReturnValue(makeSupabaseMock(() => ({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } })));
    const res = await get();
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "payment_events_load_failed" });
  });

  it("沒設 Supabase env → 503", async () => {
    getSupabaseAdmin.mockReturnValue(null);
    const res = await get();
    expect(res.status).toBe(503);
  });
});
