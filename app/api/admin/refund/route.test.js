import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/adminAuth", () => ({ verifyAdminToken: vi.fn(async () => ({ email: "admin@test" })) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/payuni", () => ({ payuniTrade: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));

import { POST } from "./route";
import { payuniTrade } from "@/lib/payuni";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { makeSupabaseMock } from "@/lib/test-helpers/supabase-mock";

// 最小 supabase 鏈式 mock：orders 單筆查詢回 order、其他 paid 單查詢回 paidOrders、update 記錄 patch
function makeSupabase(order, paidOrders = []) {
  const updates = [];
  const from = vi.fn((table) => {
    const ops = [];
    const b = new Proxy({}, {
      get(_, m) {
        if (m === "then") {
          return (resolve, reject) => {
            let r = { data: null, error: null };
            if (table === "orders" && ops.some((o) => o.m === "single")) r = { data: order, error: null };
            else if (table === "orders" && ops.some((o) => o.m === "in")) r = { data: paidOrders, error: null };
            return Promise.resolve(r).then(resolve, reject);
          };
        }
        return (...args) => {
          ops.push({ m, args });
          if (m === "update") updates.push({ table, patch: args[0] });
          return b;
        };
      },
    });
    return b;
  });
  return { from, updates };
}

// 會記錄 orders 查詢條件的 mock：用來驗證「該 email 是否還有其他有效訂單」是帶 email 條件查的
// （原本撈全部 paid 單，破千後會被 PostgREST 1000 列上限截斷而誤判，把還有效的課程存取撤掉）。
function makeSpySupabase(order, rowsFor) {
  const seen = [];   // 每次「其他有效訂單」查詢的條件
  const calls = [];  // 其他資料表的操作（deletes / updates）
  const from = (table) => {
    const ops = [];
    const b = new Proxy({}, {
      get(_, m) {
        if (m === "then") {
          return (resolve, reject) => {
            let r = { data: null, error: null };
            if (table === "orders" && ops.some((o) => o.m === "single")) r = { data: order, error: null };
            else if (table === "orders" && ops.some((o) => o.m === "in")) {
              const eqs = Object.fromEntries(ops.filter((o) => o.m === "eq").map((o) => o.args));
              const isNull = ops.some((o) => o.m === "is");
              seen.push({ eqs, isNull });
              r = { data: rowsFor({ eqs, isNull }), error: null };
            }
            return Promise.resolve(r).then(resolve, reject);
          };
        }
        return (...args) => {
          ops.push({ m, args });
          if (m === "delete" || m === "update") calls.push({ table, m });
          return b;
        };
      },
    });
    return b;
  };
  return { from, seen, calls };
}

const req = (body) => new Request("http://x/api/admin/refund", { method: "POST", body: JSON.stringify(body) });
const paidOrder = { id: "o1", email: "a@b.c", grant_email: null, plan: "course", status: "paid", payuni_trade_no: "UNI1", amount: 3999, mer_trade_no: "INREC1", pay_type: "2" };

// state：order（單筆查詢回的訂單）、paidOrders（該 email 其他有效訂單）、
//        refundColsError（寫 refunded_at／refund_amount 時的錯誤，模擬 SQL 未執行）、
//        enrollment（刪除前的快照列）、subs（被取消的 subscriptions）
function makeDb(state = {}) {
  return makeSupabaseMock((table, ops) => {
    const has = (m) => ops.some((o) => o.m === m);
    const upd = ops.find((o) => o.m === "update")?.args[0];
    if (table === "orders" && has("single")) return { data: state.order || paidOrder, error: null };
    if (table === "orders" && has("in")) return { data: state.paidOrders || [], error: null };
    if (table === "orders" && upd && "refunded_at" in upd) return { data: null, error: state.refundColsError || null };
    if (table === "enrollments" && has("maybeSingle")) return { data: state.enrollment ?? null, error: null };
    if (table === "subscriptions" && has("update")) return { data: state.subs || [], error: null };
    return { data: null, error: null };
  });
}

describe("POST /api/admin/refund", () => {
  beforeEach(() => vi.clearAllMocks());

  it("請退款時把訂單金額當 TradeAmt 送給 PAYUNi trade/close（官方文件：請退款時必填）", async () => {
    getSupabaseAdmin.mockReturnValue(makeSupabase(paidOrder));
    payuniTrade.mockResolvedValue({ success: true, status: "SUCCESS", message: "處理成功", data: {} });

    const res = await POST(req({ id: "o1" }));

    expect(res.status).toBe(200);
    expect(payuniTrade).toHaveBeenCalledWith(
      "trade/close",
      expect.objectContaining({ TradeNo: "UNI1", CloseType: "2", TradeAmt: "3999" })
    );
  });

  it("manual 模式（已在 PAYUNi 後台退款）：不呼叫 PAYUNi，直接標記已退款並撤銷存取", async () => {
    const sb = makeSupabase(paidOrder);
    getSupabaseAdmin.mockReturnValue(sb);
    payuniTrade.mockResolvedValue({ success: false, status: "X", message: "不該被呼叫", data: {} });

    const res = await POST(req({ id: "o1", manual: true }));
    const body = await res.json();

    expect(payuniTrade).not.toHaveBeenCalled();
    expect(body).toMatchObject({ ok: true, method: "manual" });
    expect(sb.updates).toContainEqual(
      expect.objectContaining({ table: "orders", patch: expect.objectContaining({ status: "refunded" }) })
    );
  });

  it("查「其他有效訂單」時一定帶 email 條件（不可全表撈，破千會被截斷而誤撤存取）", async () => {
    const sb = makeSpySupabase(paidOrder, ({ eqs, isNull }) =>
      // 同 email 另有一張已付款訂單撐著課程存取
      (eqs.email === "a@b.c" && isNull) ? [{ id: "o2", email: "a@b.c", grant_email: null }] : []
    );
    getSupabaseAdmin.mockReturnValue(sb);

    const body = await (await POST(req({ id: "o1", manual: true }))).json();

    expect(sb.seen).toHaveLength(2);
    expect(sb.seen.every((q) => q.eqs.grant_email === "a@b.c" || q.eqs.email === "a@b.c")).toBe(true);
    expect(body).toMatchObject({ ok: true, enrollmentKept: true });
    expect(sb.calls.some((c) => c.table === "enrollments" && c.m === "delete")).toBe(false);
  });

  it("該 email 沒有其他有效訂單 → 照常撤銷 enrollment", async () => {
    const sb = makeSpySupabase(paidOrder, () => []);
    getSupabaseAdmin.mockReturnValue(sb);

    const body = await (await POST(req({ id: "o1", manual: true }))).json();

    expect(body).toMatchObject({ ok: true, method: "manual" });
    expect(body.enrollmentKept).toBeUndefined();
    expect(sb.calls.some((c) => c.table === "enrollments" && c.m === "delete")).toBe(true);
  });

  it("標記退款時一併寫 refunded_at／refund_amount（updated_at 會被後續操作蓋掉，不可拿來當退款日）", async () => {
    const sb = makeDb(); getSupabaseAdmin.mockReturnValue(sb);
    const body = await (await POST(req({ id: "o1", manual: true }))).json();
    expect(body).toMatchObject({ ok: true });
    const upd = sb.arg(sb.calls.find((c) => c.table === "orders" && sb.has(c, "update")), "update");
    expect(upd).toMatchObject({ status: "refunded", refund_amount: 3999 });
    expect(upd.refunded_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("降級：orders 還沒有 refunded_at／refund_amount 欄 → 退回只寫 status，退款照樣完成", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    // PGRST204＝PostgREST schema cache 找不到該欄（supabase-payment-events.sql 未執行）
    const sb = makeDb({ refundColsError: { code: "PGRST204", message: "column refunded_at does not exist" } });
    getSupabaseAdmin.mockReturnValue(sb);

    const res = await POST(req({ id: "o1", manual: true }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, method: "manual" });
    const updates = sb.calls.filter((c) => c.table === "orders" && sb.has(c, "update")).map((c) => sb.arg(c, "update"));
    expect(updates).toHaveLength(2);                       // 第一次帶新欄位失敗 → 第二次只寫 status
    expect(Object.keys(updates[1]).sort()).toEqual(["status", "updated_at"]);
    expect(spy.mock.calls.flat().join(" ")).toContain("supabase-payment-events.sql");
    spy.mockRestore();
  });

  it("撤銷課程存取前先留 enrollments 整列快照，連同金額／訂單編號寫進稽核紀錄", async () => {
    const enrollment = { id: "e1", email: "a@b.c", course_id: "piano-101", enrolled_at: "2026-08-23T10:00:00Z", early_override: "early" };
    const sb = makeDb({ enrollment }); getSupabaseAdmin.mockReturnValue(sb);

    await POST(req({ id: "o1", manual: true }));

    // 快照要在 delete 之前取
    const order = sb.calls.filter((c) => c.table === "enrollments").map((c) => (sb.has(c, "delete") ? "delete" : "select"));
    expect(order).toEqual(["select", "delete"]);
    expect(logAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "order.refund",
      meta: expect.objectContaining({
        amount: 3999, mer_trade_no: "INREC1", payuni_trade_no: "UNI1", pay_type: "2",
        method: "manual", revoked_enrollment: enrollment,
      }),
    }));
  });

  it("快照查詢失敗不中斷退款（仍標記已退款、仍撤銷存取）", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const sb = makeDb();
    // 讓 enrollments 的 select 直接爆開
    const realFrom = sb.from;
    sb.from = vi.fn((t) => {
      const b = realFrom(t);
      return t === "enrollments" ? new Proxy(b, { get: (o, m) => (m === "select" ? () => { throw new Error("boom"); } : o[m]) }) : b;
    });
    getSupabaseAdmin.mockReturnValue(sb);

    const res = await POST(req({ id: "o1", manual: true }));

    expect(await res.json()).toMatchObject({ ok: true, method: "manual" });
    expect(sb.calls.some((c) => c.table === "enrollments" && sb.has(c, "delete"))).toBe(true);
    spy.mockRestore();
  });

  it("bundle 退款：記錄被取消的 subscriptions 筆數", async () => {
    const sb = makeDb({ order: { ...paidOrder, plan: "bundle" }, subs: [{ id: "s1" }] });
    getSupabaseAdmin.mockReturnValue(sb);

    await POST(req({ id: "o1", manual: true }));

    expect(logAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      meta: expect.objectContaining({ revoked_subscriptions: 1 }),
    }));
  });

  it("PAYUNi 拒絕時回傳原始錯誤碼與訊息，不再誤導成「等結算／隔日再試」", async () => {
    getSupabaseAdmin.mockReturnValue(makeSupabase(paidOrder));
    payuniTrade.mockImplementation(async (path) =>
      path === "trade/close"
        ? { success: false, status: "CLOSE01007", message: "商店退款功能已受限制", data: {} }
        : { success: false, status: "CANCEL03001", message: "取消授權失敗", data: {} }
    );

    const res = await POST(req({ id: "o1" }));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.detail).toContain("CLOSE01007");
    expect(body.detail).toContain("商店退款功能已受限制");
    expect(body.detail).not.toMatch(/隔日|結算|撥款/);
  });
});
