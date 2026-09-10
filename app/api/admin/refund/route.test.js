import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/adminAuth", () => ({ verifyAdminToken: vi.fn(async () => ({ email: "admin@test" })) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/payuni", () => ({ payuniTrade: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));

import { POST } from "./route";
import { payuniTrade } from "@/lib/payuni";
import { getSupabaseAdmin } from "@/lib/supabase";

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
const paidOrder = { id: "o1", email: "a@b.c", grant_email: null, plan: "course", status: "paid", payuni_trade_no: "UNI1", amount: 3999 };

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
