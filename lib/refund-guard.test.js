import { describe, it, expect } from "vitest";
import { effectiveEmail, hasOtherPaidCourseAccess } from "./refund-guard.js";

describe("effectiveEmail（實際開通 email）", () => {
  it("優先 grant_email", () => {
    expect(effectiveEmail({ grant_email: "g@x.com", email: "e@x.com" })).toBe("g@x.com");
  });
  it("無 grant_email 時用購買 email", () => {
    expect(effectiveEmail({ email: "e@x.com" })).toBe("e@x.com");
    expect(effectiveEmail({ grant_email: null, email: "e@x.com" })).toBe("e@x.com");
  });
  it("兩者皆無 → null", () => {
    expect(effectiveEmail({})).toBeNull();
    expect(effectiveEmail(null)).toBeNull();
  });
});

describe("hasOtherPaidCourseAccess（退款是否保留課程存取）", () => {
  const cur = { id: "o1", email: "a@x.com" };

  it("名下只有自己這筆 → false（可安全撤）", () => {
    expect(hasOtherPaidCourseAccess(cur, [{ id: "o1", email: "a@x.com" }])).toBe(false);
    expect(hasOtherPaidCourseAccess(cur, [])).toBe(false);
    expect(hasOtherPaidCourseAccess(cur, null)).toBe(false);
  });

  it("有另一筆同 email 的有效單 → true（保留存取）", () => {
    const orders = [{ id: "o1", email: "a@x.com" }, { id: "o2", email: "a@x.com" }];
    expect(hasOtherPaidCourseAccess(cur, orders)).toBe(true);
  });

  it("其他單都是別的 email → false", () => {
    const orders = [{ id: "o1", email: "a@x.com" }, { id: "o2", email: "b@x.com" }];
    expect(hasOtherPaidCourseAccess(cur, orders)).toBe(false);
  });

  it("另一筆用 grant_email 對到當前 email → true", () => {
    const orders = [{ id: "o2", email: "z@x.com", grant_email: "a@x.com" }];
    expect(hasOtherPaidCourseAccess(cur, orders)).toBe(true);
  });

  it("當前訂單以 grant_email 開通，另一筆 email 同值 → true", () => {
    const curG = { id: "o1", email: "buyer@x.com", grant_email: "a@x.com" };
    const orders = [{ id: "o2", email: "a@x.com" }];
    expect(hasOtherPaidCourseAccess(curG, orders)).toBe(true);
  });

  it("當前訂單無 email → false（無從比對）", () => {
    expect(hasOtherPaidCourseAccess({ id: "o1" }, [{ id: "o2", email: "a@x.com" }])).toBe(false);
  });
});
