import { describe, it, expect } from "vitest";
import { grantAccess } from "./fulfillment-grant.js";

// 記錄 upsert 呼叫的精簡 supabase 替身（驗分流邏輯，非測 mock 行為）
function fakeSupabase({ errors = {} } = {}) {
  const calls = [];
  const sb = {
    from(table) {
      return {
        upsert(row, opts) {
          calls.push({ table, row, opts });
          return Promise.resolve({ error: errors[table] || null });
        },
      };
    },
  };
  return { sb, calls };
}

describe("grantAccess", () => {
  it("course 方案：只開通 enrollments(piano-101)，不碰 subscriptions", async () => {
    const { sb, calls } = fakeSupabase();
    const res = await grantAccess(sb, { id: "o1", email: "a@b.com", plan: "course" });
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("enrollments");
    expect(calls[0].row).toEqual({ email: "a@b.com", course_id: "piano-101", order_id: "o1" });
    expect(calls[0].opts).toEqual({ onConflict: "email,course_id" });
    expect(res.ok).toBe(true);
  });

  it("bundle 方案：同時開通 enrollments 與 subscriptions(plan_type=bundle, 永久)", async () => {
    const { sb, calls } = fakeSupabase();
    const res = await grantAccess(sb, { id: "o2", email: "a@b.com", plan: "bundle" });
    const tables = calls.map((c) => c.table);
    expect(tables).toContain("enrollments");
    expect(tables).toContain("subscriptions");
    const sub = calls.find((c) => c.table === "subscriptions");
    expect(sub.row).toMatchObject({
      email: "a@b.com",
      plan_type: "bundle",
      status: "active",
      expires_at: "2999-12-31T00:00:00.000Z",
      source: "purchase",
      payuni_order_id: "o2",
    });
    expect(sub.opts).toEqual({ onConflict: "payuni_order_id", ignoreDuplicates: true });
    expect(res.ok).toBe(true);
  });

  it("game 方案：只開通 subscriptions(plan_type=game)，不碰 enrollments", async () => {
    const { sb, calls } = fakeSupabase();
    await grantAccess(sb, { id: "o3", email: "a@b.com", plan: "game" });
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("subscriptions");
    expect(calls[0].row.plan_type).toBe("game");
  });

  it("upsert 失敗時 ok=false 並帶錯誤訊息", async () => {
    const { sb } = fakeSupabase({ errors: { enrollments: { message: "boom" } } });
    const res = await grantAccess(sb, { id: "o4", email: "a@b.com", plan: "course" });
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/boom/);
  });
});
