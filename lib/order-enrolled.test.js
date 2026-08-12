import { describe, it, expect } from "vitest";
import { markEnrolled, pickUngrantedPayuni } from "./order-enrolled.js";

describe("markEnrolled（用 enrollments email 標記訂單開通狀態）", () => {
  it("email 命中 enrollments → enrolled true（大小寫/空白不敏感）", () => {
    const orders = [{ id: "1", email: "A@x.com" }, { id: "2", email: "b@x.com" }];
    const out = markEnrolled(orders, [" a@x.com "]);
    expect(out[0].enrolled).toBe(true);
    expect(out[1].enrolled).toBe(false);
  });

  it("空輸入安全", () => {
    expect(markEnrolled(null, null)).toEqual([]);
    expect(markEnrolled([{ id: "1", email: "x@x.com" }], null)[0].enrolled).toBe(false);
  });

  it("有 grant_email 時用 effective email（grant_email）判斷，非 order.email", () => {
    const orders = [{ id: "1", email: "buyer@x.com", grant_email: "student@x.com" }];
    // enrollments 含 grant_email → enrolled true
    expect(markEnrolled(orders, ["student@x.com"])[0].enrolled).toBe(true);
    // enrollments 含 order.email 但不含 grant_email → enrolled false
    expect(markEnrolled(orders, ["buyer@x.com"])[0].enrolled).toBe(false);
  });

  it("無 grant_email 時 fallback 用 order.email（既有行為不變）", () => {
    const orders = [{ id: "1", email: "buyer@x.com" }];
    expect(markEnrolled(orders, ["buyer@x.com"])[0].enrolled).toBe(true);
  });
});

describe("pickUngrantedPayuni（要開通的官網訂單）", () => {
  const orders = [
    { id: "1", email: "a@x.com", source: "payuni", status: "paid", plan: "course" },    // 未開通 → 要
    { id: "2", email: "b@x.com", source: "payuni", status: "paid", plan: "bundle" },    // 已開通 → 不要
    { id: "3", email: "c@x.com", source: "payuni", status: "pending", plan: "course" }, // 未付款 → 不要
    { id: "4", email: "d@x.com", source: "concert", status: "paid", plan: "bundle" },   // 非官網 → 不要
    { id: "5", email: "e@x.com", source: "payuni", status: "paid", plan: "game" },      // plan=game 非課程方案 → 不要（game 不寫 enrollments，本不該進「開通課程」名單）
  ];
  it("只挑 payuni + paid + plan∈{course,bundle} + 未開通", () => {
    const out = pickUngrantedPayuni(orders, ["b@x.com"]);
    expect(out.map(o => o.id)).toEqual(["1"]);
  });

  it("plan=game 即使 payuni+paid+未開通也排除（開通的是課程，game 不寫 enrollments）", () => {
    const out = pickUngrantedPayuni(orders, []);
    expect(out.map(o => o.id)).toEqual(["1", "2"]);
  });

  it("enrolledEmails 大小寫/含空白不敏感（norm 正規化後仍正確排除已開通）", () => {
    const out = pickUngrantedPayuni(orders, [" B@X.COM "]);
    expect(out.map(o => o.id)).toEqual(["1"]);
  });

  it("有 grant_email 者用 effective email 判斷：已開通到 grant_email 就不再進待開通名單", () => {
    const withGrantEmail = [
      { id: "6", email: "buyer@x.com", grant_email: "student@x.com", source: "payuni", status: "paid", plan: "course" },
    ];
    // enrollments 含 grant_email → 已開通，不進名單（即使 order.email 不在 enrollments 內）
    expect(pickUngrantedPayuni(withGrantEmail, ["student@x.com"])).toEqual([]);
    // enrollments 只含 order.email、不含 grant_email → 仍未開通到 effective email，要進名單
    expect(pickUngrantedPayuni(withGrantEmail, ["buyer@x.com"]).map(o => o.id)).toEqual(["6"]);
  });
});
