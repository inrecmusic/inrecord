import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeHashInfo } from "@/lib/payuni";

const limiter = vi.fn(async () => ({ allowed: true }));
vi.mock("@/lib/rate-limit", () => ({ createDistributedLimiter: () => (...a) => limiter(...a), clientIp: () => "1.1.1.1" }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/sale", () => ({
  getSaleSettings: vi.fn(async () => ({})),
  isOnSale: vi.fn(() => true),
  currentPrice: vi.fn(() => 3999),
  fanCouponActive: vi.fn(() => true),
  FAN_COUPON_CODE: "FAN3999",
}));
vi.mock("@/lib/coupon-hold", () => ({ releaseOwnPendingCouponHolds: vi.fn(async () => {}) }));
vi.mock("@/lib/amego-verify", () => ({ verifyTaxId: vi.fn(async () => ({ valid: true })), verifyCarrier: vi.fn(async () => ({ valid: true })) }));

import { POST } from "./route";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isOnSale } from "@/lib/sale";
import { makeSupabaseMock } from "@/lib/test-helpers/supabase-mock";

const KEY = "k".repeat(32), IV = "i".repeat(16);
const req = (body) => new Request("http://x/api/payuni/checkout", { method: "POST", body: JSON.stringify(body), headers: { "user-agent": "vitest" } });

// state：coupon（select * 回的券）、claim（限量券 CAS 是否搶到）、insertError（寫單失敗）
function makeDb(state = {}) {
  return makeSupabaseMock((table, ops) => {
    const sel = ops.find((o) => o.m === "select")?.args[0];
    const has = (m) => ops.some((o) => o.m === m);
    if (table === "coupons" && has("update")) return { data: state.claim === false ? [] : [{ id: "c1" }], error: null };
    if (table === "coupons" && sel === "*") return { data: state.coupon || null, error: null };
    if (table === "coupons") return { data: state.coupon ? { used: state.coupon.used, usage_limit: state.coupon.usage_limit } : null, error: null };
    if (table === "orders" && has("insert")) return { data: null, error: state.insertError || null };
    return { data: null, error: null };
  });
}

describe("POST /api/payuni/checkout（下單）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    limiter.mockResolvedValue({ allowed: true });
    isOnSale.mockReturnValue(true);
    vi.stubEnv("PAYUNI_MERCHANT_ID", "U000"); vi.stubEnv("PAYUNI_HASH_KEY", KEY); vi.stubEnv("PAYUNI_HASH_IV", IV);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://inrecordmusic.com");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("限流 → 429 並帶 Retry-After", async () => {
    limiter.mockResolvedValueOnce({ allowed: false, retryAfter: 30 });
    const res = await POST(req({ plan: "bundle", email: "a@x.com" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
  });

  it("dryRun 只檢查金流設定、不建單", async () => {
    const sb = makeDb(); getSupabaseAdmin.mockReturnValue(sb);
    expect(await (await POST(req({ dryRun: true }))).json()).toEqual({ ok: true });
    vi.stubEnv("PAYUNI_HASH_KEY", "");
    expect((await POST(req({ dryRun: true }))).status).toBe(500);
    expect(sb.calls.some((c) => c.table === "orders")).toBe(false);
  });

  it("方案不合法／Email 不合法 → 400", async () => {
    getSupabaseAdmin.mockReturnValue(makeDb());
    expect(await (await POST(req({ plan: "game", email: "a@x.com" }))).json()).toEqual({ error: "invalid_plan" });
    expect(await (await POST(req({ plan: "bundle", email: "nope" }))).json()).toEqual({ error: "invalid_email" });
  });

  it("未開賣且沒有指定價券 → 400 not_on_sale", async () => {
    getSupabaseAdmin.mockReturnValue(makeDb());
    isOnSale.mockReturnValue(false);
    expect(await (await POST(req({ plan: "bundle", email: "a@x.com" }))).json()).toEqual({ error: "not_on_sale" });
  });

  it("正常下單：價格由後端決定、建 pending 單、回 PAYUNi 表單欄位且 HashInfo 可驗", async () => {
    const sb = makeDb(); getSupabaseAdmin.mockReturnValue(sb);
    const body = await (await POST(req({ plan: "bundle", email: "a@x.com", price: 1 }))).json(); // 前端亂傳 price 1 也不理
    expect(body.url).toBeTruthy();
    expect(body.fields).toMatchObject({ MerID: "U000", Version: "1.0" });
    expect(body.fields.HashInfo).toBe(makeHashInfo(body.fields.EncryptInfo, KEY, IV));
    const ins = sb.calls.find((c) => c.table === "orders" && sb.has(c, "insert"));
    expect(sb.arg(ins, "insert")).toMatchObject({ plan: "bundle", amount: 3999, status: "pending", email: "a@x.com", currency: "twd" });
    expect(sb.arg(ins, "insert").mer_trade_no).toMatch(/^INREC\d+$/);
  });

  it("寫單失敗 → 500，且不吐出可付款的欄位（避免付了錢 DB 查無此單）", async () => {
    getSupabaseAdmin.mockReturnValue(makeDb({ insertError: { message: "db down" } }));
    const res = await POST(req({ plan: "bundle", email: "a@x.com" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "order_create_failed" });
  });

  it("限量指定價券：未開賣也放行、CAS 預扣成功 → 價格＝券價、訂單帶 coupon_code", async () => {
    const coupon = { code: "TEST1", type: "price", value: 1, status: "active", usage_limit: 1, used: 0, plan: null };
    const sb = makeDb({ coupon }); getSupabaseAdmin.mockReturnValue(sb);
    isOnSale.mockReturnValue(false);
    const body = await (await POST(req({ plan: "bundle", email: "a@x.com", couponCode: "test1" }))).json();
    expect(body.fields).toBeTruthy();
    const ins = sb.calls.find((c) => c.table === "orders" && sb.has(c, "insert"));
    expect(sb.arg(ins, "insert")).toMatchObject({ amount: 1, coupon_code: "TEST1" });
    const cas = sb.calls.find((c) => c.table === "coupons" && sb.has(c, "update"));
    expect(sb.arg(cas, "update")).toEqual({ used: 1 });
  });

  it("限量券被搶完（CAS 沒搶到）→ 400 coupon_used_up、不建單", async () => {
    const coupon = { code: "TEST1", type: "price", value: 1, status: "active", usage_limit: 1, used: 0, plan: null };
    const sb = makeDb({ coupon, claim: false }); getSupabaseAdmin.mockReturnValue(sb);
    const res = await POST(req({ plan: "bundle", email: "a@x.com", couponCode: "TEST1" }));
    expect(await res.json()).toEqual({ error: "coupon_used_up" });
    expect(sb.calls.some((c) => c.table === "orders" && sb.has(c, "insert"))).toBe(false);
  });
});
