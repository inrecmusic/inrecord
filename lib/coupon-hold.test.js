import { describe, it, expect } from "vitest";
import { expirePendingOrderAndRelease, releaseOwnPendingCouponHolds } from "./coupon-hold.js";

// 迷你 supabase 模擬：select/update/eq/maybeSingle 鏈式；update 只套用到通過 eq 過濾的列（可模擬 CAS）。
function fakeDb(tables) {
  return {
    tables,
    from(table) {
      const filters = []; let patch = null; let single = false;
      const q = {
        select() { return q; },
        update(p) { patch = p; return q; },
        eq(k, v) { filters.push([k, v]); return q; },
        maybeSingle() { single = true; return q; },
        then(resolve) {
          const rows = tables[table].filter((r) => filters.every(([k, v]) => r[k] === v));
          if (patch) rows.forEach((r) => Object.assign(r, patch));
          const data = single ? (rows[0] ? { ...rows[0] } : null) : rows.map((r) => ({ ...r }));
          return resolve({ data, error: null });
        },
      };
      return q;
    },
  };
}

describe("expirePendingOrderAndRelease", () => {
  it("pending 單 → 標 expired 並退回限量券 1 個額度", async () => {
    const db = fakeDb({ orders: [{ id: "o1", status: "pending" }], coupons: [{ code: "VIP", used: 2, usage_limit: 5 }] });
    const r = await expirePendingOrderAndRelease(db, { orderId: "o1", couponCode: "VIP" });
    expect(r).toEqual({ expired: true, released: true });
    expect(db.tables.orders[0].status).toBe("expired");
    expect(db.tables.coupons[0].used).toBe(1);
  });
  it("已付款單不動、券也不退（避免與 notify 競態）", async () => {
    const db = fakeDb({ orders: [{ id: "o1", status: "paid" }], coupons: [{ code: "VIP", used: 2, usage_limit: 5 }] });
    const r = await expirePendingOrderAndRelease(db, { orderId: "o1", couponCode: "VIP" });
    expect(r).toEqual({ expired: false, released: false });
    expect(db.tables.orders[0].status).toBe("paid");
    expect(db.tables.coupons[0].used).toBe(2);
  });
  it("無限量券只作廢訂單、不改 used", async () => {
    const db = fakeDb({ orders: [{ id: "o1", status: "pending" }], coupons: [{ code: "FAN3999", used: 7, usage_limit: null }] });
    const r = await expirePendingOrderAndRelease(db, { orderId: "o1", couponCode: "FAN3999" });
    expect(r).toEqual({ expired: true, released: false });
    expect(db.tables.coupons[0].used).toBe(7);
  });
});

describe("releaseOwnPendingCouponHolds", () => {
  it("只作廢同 email × 同券的 pending 舊單，別人的與已付款的不動", async () => {
    const db = fakeDb({
      orders: [
        { id: "a", email: "me@x.com", coupon_code: "VIP", status: "pending" },
        { id: "b", email: "me@x.com", coupon_code: "VIP", status: "pending" },
        { id: "c", email: "me@x.com", coupon_code: "VIP", status: "paid" },
        { id: "d", email: "you@x.com", coupon_code: "VIP", status: "pending" },
        { id: "e", email: "me@x.com", coupon_code: "OTHER", status: "pending" },
      ],
      coupons: [{ code: "VIP", used: 4, usage_limit: 4 }],
    });
    const n = await releaseOwnPendingCouponHolds(db, { email: "me@x.com", couponCode: "VIP" });
    expect(n).toBe(2);
    expect(db.tables.orders.map((o) => o.status)).toEqual(["expired", "expired", "paid", "pending", "pending"]);
    expect(db.tables.coupons[0].used).toBe(2);
  });
  it("缺 email 或券碼直接回 0", async () => {
    const db = fakeDb({ orders: [], coupons: [] });
    expect(await releaseOwnPendingCouponHolds(db, { email: "", couponCode: "VIP" })).toBe(0);
  });
});
