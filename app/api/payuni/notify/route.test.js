import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/amego-invoice", () => ({ createInvoice: vi.fn(async () => ({ success: true, invoiceNo: "AA1" })) }));
vi.mock("@/lib/brevo-email", () => ({ sendPurchaseEmail: vi.fn(async () => ({ success: true, messageId: "m1" })) }));
vi.mock("@/lib/fulfillment-grant", () => ({ grantAccess: vi.fn(async () => ({ ok: true, errors: [] })) }));
vi.mock("@/lib/sale", () => ({ getSaleSettings: vi.fn(async () => ({})), isPresale: vi.fn(() => false) }));
vi.mock("@/lib/admin-alert", async (orig) => ({ ...(await orig()), sendAdminAlert: vi.fn(async () => {}) }));
vi.mock("@/lib/meta-capi", () => ({ sendPurchase: vi.fn(async () => ({ ok: true })) }));

import { POST } from "./route";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendPurchaseEmail } from "@/lib/brevo-email";
import { grantAccess } from "@/lib/fulfillment-grant";
import { createInvoice } from "@/lib/amego-invoice";
import { sendAdminAlert } from "@/lib/admin-alert";
import { makeSupabaseMock } from "@/lib/test-helpers/supabase-mock";

const KEY = "k".repeat(32), IV = "i".repeat(16);
// 與 PAYUNi／checkout 同一套：AES-256-GCM → hex(base64(密文):::base64(tag))，HashInfo=SHA256(key+EncryptInfo+iv) 大寫
function encrypt(params) {
  const c = crypto.createCipheriv("aes-256-gcm", Buffer.from(KEY), Buffer.from(IV));
  let e = c.update(new URLSearchParams(params).toString(), "utf8", "base64"); e += c.final("base64");
  return Buffer.from(`${e}:::${c.getAuthTag().toString("base64")}`).toString("hex");
}
const hashOf = (ei) => crypto.createHash("sha256").update(KEY + ei + IV).digest("hex").toUpperCase();
function notifyReq(params, { badHash = false } = {}) {
  const ei = encrypt(params);
  const fd = new FormData(); fd.set("EncryptInfo", ei); fd.set("HashInfo", badHash ? "DEADBEEF" : hashOf(ei));
  return new Request("http://x/api/payuni/notify", { method: "POST", body: fd });
}
const PAID = { MerTradeNo: "INREC1", TradeNo: "UNI1", TradeStatus: "1", TradeAmt: "3999", PaymentType: "CREDIT" };
const ORDER = { id: "o1", email: "a@x.com", grant_email: null, plan: "bundle", plan_label: "課程包", amount: 3999, coupon_code: null, fulfilled_at: null, invoice_no: null, attribution: null, capi_data: null };

// state：prior（先讀到的訂單）、priorError、order（update→paid 命中的列；null＝未命中/已退款）、claimed（fulfilled_at CAS）
function makeDb(state = {}) {
  return makeSupabaseMock((table, ops) => {
    const has = (m) => ops.some((o) => o.m === m);
    const upd = ops.find((o) => o.m === "update")?.args[0];
    if (table !== "orders") return { data: null, error: null };
    if (has("maybeSingle") && !has("update")) return { data: state.prior === undefined ? { status: "pending", amount: 3999 } : state.prior, error: state.priorError || null };
    if (upd && "status" in upd) return { data: state.order === undefined ? ORDER : state.order, error: null };
    if (upd && "fulfilled_at" in upd) return { data: state.claimed === false ? null : { id: "o1" }, error: null };
    return { data: null, error: null };
  });
}

describe("POST /api/payuni/notify（付款背景通知）", () => {
  let sb;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PAYUNI_HASH_KEY", KEY); vi.stubEnv("PAYUNI_HASH_IV", IV);
    vi.stubEnv("AUTO_GRANT_ACCESS", ""); vi.stubEnv("AUTO_INVOICE", "");
    sb = makeDb(); getSupabaseAdmin.mockReturnValue(sb);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("非表單／缺欄位／Hash 不符 → 400，不碰資料庫", async () => {
    expect((await POST(new Request("http://x", { method: "POST", body: "{}" }))).status).toBe(400);
    const fd = new FormData(); fd.set("EncryptInfo", "abc");
    expect((await POST(new Request("http://x", { method: "POST", body: fd }))).status).toBe(400);
    expect((await POST(notifyReq(PAID, { badHash: true }))).status).toBe(400);
    expect(sb.from).not.toHaveBeenCalled();
  });

  it("TradeStatus≠1（付款未成功）→ 回 SUCCESS 但不更新任何訂單", async () => {
    const res = await POST(notifyReq({ ...PAID, TradeStatus: "0" }));
    expect(res.status).toBe(200); expect(await res.text()).toBe("SUCCESS");
    expect(sb.from).not.toHaveBeenCalled();
  });

  it("查無此單 → 回 SUCCESS（避免重送轟炸）、不建孤兒單、寄管理員告警", async () => {
    sb = makeDb({ prior: null }); getSupabaseAdmin.mockReturnValue(sb);
    const res = await POST(notifyReq(PAID));
    expect(await res.text()).toBe("SUCCESS");
    expect(sb.calls.some((c) => sb.has(c, "update") || sb.has(c, "insert") || sb.has(c, "upsert"))).toBe(false);
    expect(sendAdminAlert).toHaveBeenCalledTimes(1);
  });

  it("讀訂單時 DB 錯誤 → 回 FAIL 500 讓 PAYUNi 重送，並告警", async () => {
    sb = makeDb({ priorError: { message: "timeout" } }); getSupabaseAdmin.mockReturnValue(sb);
    const res = await POST(notifyReq(PAID));
    expect(res.status).toBe(500);
    expect(sendAdminAlert).toHaveBeenCalledTimes(1);
  });

  it("付款成功（自動開通關閉）：訂單轉 paid、不開通、寄「預購成功」信、不開發票、回 SUCCESS", async () => {
    const res = await POST(notifyReq(PAID));
    expect(await res.text()).toBe("SUCCESS");
    const upd = sb.calls.find((c) => c.table === "orders" && sb.has(c, "update") && "status" in sb.arg(c, "update"));
    expect(sb.arg(upd, "update")).toMatchObject({ status: "paid", payuni_trade_no: "UNI1", pay_type: "CREDIT" });
    expect(sb.has(upd, "neq")).toBe(true); // 已退款守衛
    expect(grantAccess).not.toHaveBeenCalled();
    expect(sendPurchaseEmail).toHaveBeenCalledWith(expect.objectContaining({ email: "a@x.com", merTradeNo: "INREC1", presale: true }));
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("AUTO_GRANT_ACCESS=on → 付款即開通", async () => {
    vi.stubEnv("AUTO_GRANT_ACCESS", "on");
    await POST(notifyReq(PAID));
    expect(grantAccess).toHaveBeenCalledWith(sb, expect.objectContaining({ id: "o1", email: "a@x.com" }));
  });

  it("重送的 notify：fulfilled_at 已被搶走 → 不重複寄信", async () => {
    sb = makeDb({ claimed: false }); getSupabaseAdmin.mockReturnValue(sb);
    const res = await POST(notifyReq(PAID));
    expect(await res.text()).toBe("SUCCESS");
    expect(sendPurchaseEmail).not.toHaveBeenCalled();
  });

  it("已退款訂單（update 未命中）→ 不開通、不寄信、回 SUCCESS", async () => {
    sb = makeDb({ order: null }); getSupabaseAdmin.mockReturnValue(sb);
    const res = await POST(notifyReq(PAID));
    expect(await res.text()).toBe("SUCCESS");
    expect(sendPurchaseEmail).not.toHaveBeenCalled();
    expect(grantAccess).not.toHaveBeenCalled();
  });
});
