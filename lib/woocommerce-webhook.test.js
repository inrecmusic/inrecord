import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { handleWoocommerceWebhook } from "./woocommerce-webhook.js";

const SECRET = "shop-secret-123";
const productMap = { "93": "bundle" };

function signWoo(rawBody, secret) {
  return crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
}

function fakeSupabase({ error = null } = {}) {
  const calls = [];
  const sb = {
    from(table) {
      return {
        upsert(row, opts) {
          calls.push({ table, row, opts });
          return Promise.resolve({ error });
        },
      };
    },
  };
  return { sb, calls };
}

function orderPayload(overrides = {}) {
  return JSON.stringify({
    id: 727,
    status: "processing",
    billing: { email: "Fan@Example.com " },
    line_items: [
      { product_id: 93, name: "課程包（課程＋AI 遊戲）", quantity: 1, total: "3999.00" },
      { product_id: 22, name: "鋼琴貼紙周邊", quantity: 1, total: "150.00" },
    ],
    ...overrides,
  });
}

function call(rawBody, { secret = SECRET, sig, supabase } = {}) {
  const { sb, calls } = supabase || fakeSupabase();
  return handleWoocommerceWebhook({
    rawBody,
    signature: sig === undefined ? signWoo(rawBody, SECRET) : sig,
    secret,
    productMap,
    supabase: sb === null ? null : sb,
  }).then((res) => ({ res, calls }));
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
      plan: "bundle",
      plan_label: "課程包（課程＋AI 遊戲）",
      amount: 3999,
      currency: "twd",
      status: "paid",
      source: "wordpress",
    });
    expect(calls[0].opts).toEqual({ onConflict: "mer_trade_no", ignoreDuplicates: true });
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
});
