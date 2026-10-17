import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const rl = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/lib/rate-limit", () => ({
  createDistributedLimiter: () => async () => ({ allowed: rl.allowed, retryAfter: 60 }),
  clientIp: () => "1.1.1.1",
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/fulfillment-grant", () => ({ grantAccess: vi.fn(async () => ({ ok: true, errors: [] })) }));

import { POST } from "./route";
import { getSupabaseAdmin } from "@/lib/supabase";
import { grantAccess } from "@/lib/fulfillment-grant";
import { signGrantToken } from "@/lib/grant-token";
import { makeSupabaseMock } from "@/lib/test-helpers/supabase-mock";

const TRADE = "INREC1";
// 付款信箱 a@x.com、bundle、尚未指定開通信箱
const ORDER = { id: "o1", status: "paid", email: "a@x.com", plan: "bundle", grant_email: null };

function req(body) {
  return new Request("http://x/api/order/grant-email", { method: "POST", body: JSON.stringify(body) });
}
const good = (email, extra = {}) => req({ MerTradeNo: TRADE, email, grantToken: signGrantToken(TRADE), ...extra });

// state：order（讀到的訂單；null＝查無）、findError、updateError（寫 grant_email 失敗）、
//        otherOrders（付款信箱名下其他有效課程訂單）、othersError（查其他訂單失敗）
function makeDb(state = {}) {
  return makeSupabaseMock((table, ops) => {
    const has = (m) => ops.some((o) => o.m === m);
    if (table === "orders" && has("maybeSingle")) return { data: state.order === undefined ? ORDER : state.order, error: state.findError || null };
    if (table === "orders" && has("in")) return { data: state.otherOrders || [], error: state.othersError || null };
    if (table === "orders" && has("update")) return { data: null, error: state.updateError || null };
    return { data: null, error: null };
  });
}
const grantEmailUpd = (sb) => sb.calls.find((c) => c.table === "orders" && sb.has(c, "update") && "grant_email" in sb.arg(c, "update"));
const enrollDel = (sb) => sb.calls.find((c) => c.table === "enrollments" && sb.has(c, "delete"));
const subUpd = (sb) => sb.calls.find((c) => c.table === "subscriptions" && sb.has(c, "update"));
const hasEq = (c, col, val) => c.ops.some((o) => o.m === "eq" && o.args[0] === col && o.args[1] === val);

describe("POST /api/order/grant-email（付款成功頁指定開通信箱）", () => {
  let sb;
  beforeEach(() => {
    vi.clearAllMocks();
    rl.allowed = true;
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-secret");
    vi.stubEnv("AUTO_GRANT_ACCESS", "");
    sb = makeDb(); getSupabaseAdmin.mockReturnValue(sb);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("信箱格式不對／缺交易號 → 400，不碰資料庫", async () => {
    expect((await POST(good("not-an-email"))).status).toBe(400);
    expect((await POST(req({ email: "b@x.com", grantToken: "t" }))).status).toBe(400);
    expect(sb.from).not.toHaveBeenCalled();
  });

  it("grantToken 錯誤或過期 → 403 bad_token，不碰資料庫", async () => {
    const res = await POST(req({ MerTradeNo: TRADE, email: "b@x.com", grantToken: signGrantToken("INREC-OTHER") }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("bad_token");
    expect(sb.from).not.toHaveBeenCalled();
  });

  it("超過速率限制 → 429 並帶 Retry-After", async () => {
    rl.allowed = false;
    const res = await POST(good("b@x.com"));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
  });

  it("查無訂單 404；未付款 403 not_paid；已指定過 409 already_set（單次、不可覆蓋）", async () => {
    getSupabaseAdmin.mockReturnValue(makeDb({ order: null }));
    expect((await POST(good("b@x.com"))).status).toBe(404);
    getSupabaseAdmin.mockReturnValue(makeDb({ order: { ...ORDER, status: "pending" } }));
    expect((await POST(good("b@x.com"))).status).toBe(403);
    getSupabaseAdmin.mockReturnValue(makeDb({ order: { ...ORDER, grant_email: "old@x.com" } }));
    const res = await POST(good("b@x.com"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("already_set");
    expect(grantAccess).not.toHaveBeenCalled();
  });

  it("正常：grant_email 以小寫寫入該筆訂單，回 { ok, email }", async () => {
    const res = await POST(good("Learn@X.com"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, email: "learn@x.com" });
    const upd = grantEmailUpd(sb);
    expect(sb.arg(upd, "update")).toEqual({ grant_email: "learn@x.com" });
    expect(hasEq(upd, "mer_trade_no", TRADE)).toBe(true);
  });

  it("讀訂單時有帶 email／plan／grant_email 欄位（grantAccess 要用）", async () => {
    await POST(good("learn@x.com"));
    const find = sb.calls.find((c) => c.table === "orders" && sb.has(c, "maybeSingle"));
    const cols = String(sb.arg(find, "select")).split(",").map((s) => s.trim());
    expect(cols).toEqual(expect.arrayContaining(["id", "status", "email", "plan", "grant_email"]));
  });

  it("寫入 grant_email 失敗 → 500 server_error，不開通", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("AUTO_GRANT_ACCESS", "on");
    getSupabaseAdmin.mockReturnValue(makeDb({ updateError: { message: "boom" } }));
    expect((await POST(good("learn@x.com"))).status).toBe(500);
    expect(grantAccess).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  describe("AUTO_GRANT_ACCESS=on：開通信箱 ≠ 付款信箱時，把這張訂單的開通搬到新信箱", () => {
    beforeEach(() => vi.stubEnv("AUTO_GRANT_ACCESS", "on"));

    it("先寫入 grant_email，再以 grant_email 呼叫 grantAccess（課程開到新信箱）", async () => {
      let grantEmailWrittenFirst = false;
      grantAccess.mockImplementationOnce(async () => { grantEmailWrittenFirst = !!grantEmailUpd(sb); return { ok: true, errors: [] }; });
      const res = await POST(good("learn@x.com"));
      expect(res.status).toBe(200);
      expect(grantAccess).toHaveBeenCalledWith(sb, expect.objectContaining({ id: "o1", email: "a@x.com", plan: "bundle", grant_email: "learn@x.com" }));
      expect(grantEmailWrittenFirst).toBe(true);
    });

    it("收回付款信箱上由這張訂單建立的 enrollments：只刪 email＋course_id＋order_id 都相符的那一列", async () => {
      await POST(good("learn@x.com"));
      const del = enrollDel(sb);
      expect(del).toBeTruthy();
      expect(hasEq(del, "email", "a@x.com")).toBe(true); // 不能連新信箱那列（order_id 相同）一起刪
      expect(hasEq(del, "course_id", "piano-101")).toBe(true);
      expect(hasEq(del, "order_id", "o1")).toBe(true);
      // 刪之前有查付款信箱名下的其他有效課程訂單（只撈這個 email，不撈全表）
      const guard = sb.calls.filter((c) => c.table === "orders" && sb.has(c, "in"));
      expect(guard.length).toBeGreaterThan(0);
      expect(guard.every((c) => hasEq(c, "status", "paid") && (hasEq(c, "email", "a@x.com") || hasEq(c, "grant_email", "a@x.com")))).toBe(true);
    });

    // enrollments 同 email 只有一列、order_id 會被最新一筆覆蓋（同 lib/refund-guard）：
    // 老學員再買一份送朋友並把開通信箱改成朋友的，不能把自己的開通刪掉
    it("付款信箱名下還有其他有效課程訂單 → 保留付款信箱的 enrollments，但新信箱照開、遊戲存取照搬", async () => {
      getSupabaseAdmin.mockReturnValue(sb = makeDb({ otherOrders: [{ id: "o0", email: "a@x.com", grant_email: null }] }));
      await POST(good("learn@x.com"));
      expect(grantAccess).toHaveBeenCalledWith(sb, expect.objectContaining({ grant_email: "learn@x.com" }));
      expect(enrollDel(sb)).toBeUndefined();
      expect(subUpd(sb)).toBeTruthy();
    });

    it("查其他訂單失敗 → 保守不刪（寧可多留一份存取），回 200", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      getSupabaseAdmin.mockReturnValue(sb = makeDb({ othersError: { message: "timeout" } }));
      expect((await POST(good("learn@x.com"))).status).toBe(200);
      expect(enrollDel(sb)).toBeUndefined();
      spy.mockRestore();
    });

    it("bundle：AI 遊戲存取（subscriptions 以 payuni_order_id 唯一，無法對新信箱再 insert）改把該列 email 搬到新信箱", async () => {
      await POST(good("learn@x.com"));
      const upd = subUpd(sb);
      expect(upd).toBeTruthy();
      expect(sb.arg(upd, "update")).toEqual({ email: "learn@x.com" });
      expect(hasEq(upd, "payuni_order_id", "o1")).toBe(true);
      expect(hasEq(upd, "source", "purchase")).toBe(true);
      expect(hasEq(upd, "email", "a@x.com")).toBe(true);
    });

    it("course 方案：沒有遊戲存取，不碰 subscriptions", async () => {
      getSupabaseAdmin.mockReturnValue(sb = makeDb({ order: { ...ORDER, plan: "course" } }));
      await POST(good("learn@x.com"));
      expect(enrollDel(sb)).toBeTruthy();
      expect(subUpd(sb)).toBeUndefined();
    });

    it("grantAccess 失敗 → 不刪舊 enrollments、不搬 subscriptions（學員仍可用付款信箱進教室），回 200 並記 log", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      grantAccess.mockResolvedValueOnce({ ok: false, errors: ["enrollments: boom"] });
      const res = await POST(good("learn@x.com"));
      expect(res.status).toBe(200);
      expect(enrollDel(sb)).toBeUndefined();
      expect(subUpd(sb)).toBeUndefined();
      expect(spy).toHaveBeenCalledWith(expect.stringContaining("[grant-email]"), expect.anything(), expect.anything());
      spy.mockRestore();
    });

    it("開通信箱與付款信箱相同（只差大小寫也算）→ 不重開通、不刪", async () => {
      await POST(good("A@x.com"));
      expect(grantAccess).not.toHaveBeenCalled();
      expect(enrollDel(sb)).toBeUndefined();
      expect(subUpd(sb)).toBeUndefined();
    });
  });

  it("AUTO_GRANT_ACCESS 關閉：只記 grant_email，不開通、不刪（照舊由後台付款名單手動開通）", async () => {
    await POST(good("learn@x.com"));
    expect(grantEmailUpd(sb)).toBeTruthy();
    expect(grantAccess).not.toHaveBeenCalled();
    expect(enrollDel(sb)).toBeUndefined();
  });
});
