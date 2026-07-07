import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { handleWoocommerceWebhook } from "./woocommerce-webhook.js";

const SECRET = "shop-secret-123";
const productMap = { "93": "bundle" };

function signWoo(rawBody, secret) {
  return crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
}

function fakeSupabase({ error = null, claimRow = { id: "row-1" } } = {}) {
  const calls = [];
  const updates = [];
  const sb = {
    from(table) {
      return {
        upsert(row, opts) {
          calls.push({ table, row, opts });
          return Promise.resolve({ error });
        },
        update(patch) {
          const rec = { table, patch, filters: {} };
          updates.push(rec);
          const chain = {
            eq(col, val) { rec.filters[col] = val; return chain; },
            is(col, val) { rec.filters[col] = `is:${String(val)}`; return chain; },
            select() { return chain; },
            maybeSingle() { return Promise.resolve({ data: claimRow, error: null }); },
            then(resolve, reject) { return Promise.resolve({ data: null, error: null }).then(resolve, reject); },
          };
          return chain;
        },
      };
    },
  };
  return { sb, calls, updates };
}

function orderPayload(overrides = {}) {
  return JSON.stringify({
    id: 727,
    status: "processing",
    billing: { email: "Fan@Example.com ", phone: "0912-345-678" },
    line_items: [
      { product_id: 93, name: "課程包（課程＋AI 遊戲）", quantity: 1, total: "3999.00" },
      { product_id: 22, name: "鋼琴貼紙周邊", quantity: 1, total: "150.00" },
    ],
    ...overrides,
  });
}

function call(rawBody, { secret = SECRET, sig, supabase, source, sendEmail } = {}) {
  const { sb, calls, updates } = supabase || fakeSupabase();
  return handleWoocommerceWebhook({
    rawBody,
    signature: sig === undefined ? signWoo(rawBody, SECRET) : sig,
    secret,
    productMap,
    supabase: sb === null ? null : sb,
    source,
    sendEmail,
  }).then((res) => ({ res, calls, updates }));
}

function fakeSender(result = { success: true }) {
  const sent = [];
  const sendEmail = async (args) => { sent.push(args); return result; };
  return { sendEmail, sent };
}

describe("handleWoocommerceWebhook", () => {
  it("缺 secret → 500", async () => {
    const { res, calls } = await call(orderPayload(), { secret: "" });
    expect(res.status).toBe(500);
    expect(calls).toHaveLength(0);
  });

  it("缺簽章（WooCommerce 連線測試 ping）→ 200，不寫入", async () => {
    const { res, calls } = await call(orderPayload(), { sig: null });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(0);
  });

  it("簽章錯誤 → 401，不寫入", async () => {
    const { res, calls } = await call(orderPayload(), { sig: "wrongsig" });
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("驗章通過 + 已付款課程訂單 → 200，upsert 進名單(source=wordpress,status=paid)", async () => {
    const { res, calls } = await call(orderPayload());
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("orders");
    expect(calls[0].row).toMatchObject({
      mer_trade_no: "WC727",
      email: "fan@example.com",
      phone: "0912-345-678",
      plan: "bundle",
      plan_label: "課程包（課程＋AI 遊戲）",
      amount: 3999,
      currency: "twd",
      status: "paid",
      source: "wordpress",
    });
    expect(calls[0].opts).toEqual({ onConflict: "mer_trade_no", ignoreDuplicates: true });
  });

  it("傳 source=concert → 進名單標 source=concert", async () => {
    const { res, calls } = await call(orderPayload(), { source: "concert" });
    expect(res.status).toBe(200);
    expect(calls[0].row.source).toBe("concert");
  });

  it("source=concert → mer_trade_no 用 CC 前綴（避免與 WooCommerce WC{id} 碰撞被 ignoreDuplicates 吞單）", async () => {
    const { calls } = await call(orderPayload(), { source: "concert" });
    expect(calls[0].row.mer_trade_no).toBe("CC727");
  });

  it("source=wordpress → mer_trade_no 維持 WC 前綴", async () => {
    const { calls } = await call(orderPayload());
    expect(calls[0].row.mer_trade_no).toBe("WC727");
  });

  it("未付款狀態（pending）→ 200，不寫入", async () => {
    const { res, calls } = await call(orderPayload({ status: "pending" }));
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(0);
  });

  it("純周邊訂單（無課程商品）→ 200，不寫入", async () => {
    const body = orderPayload({ line_items: [{ product_id: 22, name: "周邊", quantity: 1, total: "150.00" }] });
    const { res, calls } = await call(body);
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(0);
  });

  it("非 JSON body（探測）→ 200，不寫入", async () => {
    const { res, calls } = await call("not-json-garbage");
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(0);
  });

  it("課程訂單但 supabase 未配置 → 200，不丟例外", async () => {
    const { res } = await call(orderPayload(), { supabase: { sb: null } });
    expect(res.status).toBe(200);
  });

  it("upsert 失敗 → 500", async () => {
    const { res } = await call(orderPayload(), { supabase: fakeSupabase({ error: { message: "db down" } }) });
    expect(res.status).toBe(500);
  });

  // ── 自動寄預購成功信（2026-07-07：付款成功入名單後自動寄，取代純手動）──

  it("未注入 sendEmail → 只入名單，不進寄信流程（相容舊行為）", async () => {
    const { res, updates } = await call(orderPayload());
    expect(res.status).toBe(200);
    expect(updates).toHaveLength(0);
  });

  it("已付款課程訂單 → 原子 claim presale_email_sent_at 後自動寄信，成功清 email_error", async () => {
    const { sendEmail, sent } = fakeSender({ success: true });
    const { res, updates } = await call(orderPayload(), { sendEmail });
    expect(res.status).toBe(200);

    // 第一個 update = 原子 claim：條件必須含 mer_trade_no + presale_email_sent_at IS NULL
    expect(updates[0].patch.presale_email_sent_at).toBeTruthy();
    expect(updates[0].filters).toMatchObject({ mer_trade_no: "WC727", presale_email_sent_at: "is:null" });

    // 寄信帶正確參數（email 已正規化小寫）
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      email: "fan@example.com",
      plan: "bundle",
      planLabel: "課程包（課程＋AI 遊戲）",
      merTradeNo: "WC727",
    });

    // 成功 → 清 email_error、旗標保留
    expect(updates[1].patch).toEqual({ email_error: null });
    expect(updates[1].filters).toMatchObject({ id: "row-1" });
  });

  it("webhook 重送（旗標已被 claim）→ 不重複寄信", async () => {
    const { sendEmail, sent } = fakeSender();
    const { res, updates } = await call(orderPayload(), {
      sendEmail,
      supabase: fakeSupabase({ claimRow: null }),
    });
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(0);
    expect(updates).toHaveLength(1); // 只有 claim 嘗試，沒有後續寫入
  });

  it("寄信失敗 → 回滾旗標為 NULL＋記 email_error（名單維持未寄可手動重寄），webhook 仍回 200", async () => {
    const { sendEmail } = fakeSender({ success: false, error: "brevo_500" });
    const { res, updates } = await call(orderPayload(), { sendEmail });
    expect(res.status).toBe(200);
    expect(updates[1].patch).toEqual({ presale_email_sent_at: null, email_error: "brevo_500" });
    expect(updates[1].filters).toMatchObject({ id: "row-1" });
  });

  it("寄信被跳過（Brevo 未配置）→ 回滾旗標但不記 email_error", async () => {
    const { sendEmail } = fakeSender({ success: false, skipped: true });
    const { res, updates } = await call(orderPayload(), { sendEmail });
    expect(res.status).toBe(200);
    expect(updates[1].patch).toEqual({ presale_email_sent_at: null });
  });

  it("sendEmail 拋例外 → 視同失敗回滾＋記錄，webhook 不受影響回 200", async () => {
    const sendEmail = async () => { throw new Error("network down"); };
    const { res, updates } = await call(orderPayload(), { sendEmail });
    expect(res.status).toBe(200);
    expect(updates[1].patch.presale_email_sent_at).toBeNull();
    expect(updates[1].patch.email_error).toContain("network down");
  });
});
