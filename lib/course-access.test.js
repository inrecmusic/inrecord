import { describe, it, expect } from "vitest";
import { hasCourseAccess } from "./course-access.js";

// service-role client 假物件：依 .eq() 過濾 enrollments seed，maybeSingle 回首筆。
function fakeAdmin(rows) {
  return {
    from() {
      let r = [...rows];
      const b = {
        select() { return b; },
        eq(col, val) { r = r.filter((x) => x[col] === val); return b; },
        maybeSingle() { return Promise.resolve({ data: r[0] || null, error: null }); },
      };
      return b;
    },
  };
}

describe("hasCourseAccess", () => {
  const enrolled = [{ id: "e1", email: "buyer@x.com", course_id: "piano-101" }];

  it("已購課（有 enrollments）→ true", async () => {
    expect(await hasCourseAccess(fakeAdmin(enrolled), "buyer@x.com")).toBe(true);
  });

  it("未購課（無對應 enrollments）→ false", async () => {
    expect(await hasCourseAccess(fakeAdmin(enrolled), "stranger@x.com")).toBe(false);
    expect(await hasCourseAccess(fakeAdmin([]), "buyer@x.com")).toBe(false);
  });

  it("缺 email 或缺 supabase → false（不放行）", async () => {
    expect(await hasCourseAccess(fakeAdmin(enrolled), null)).toBe(false);
    expect(await hasCourseAccess(null, "buyer@x.com")).toBe(false);
  });
});
