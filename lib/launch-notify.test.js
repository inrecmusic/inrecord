import { describe, it, expect, vi } from "vitest";
import { runLaunchNotify } from "./launch-notify.js";

// 最小 supabase mock：sale_settings CAS + orders 查詢
function makeSupabase({ claimRows, orders }) {
  return {
    from(table) {
      if (table === "sale_settings") {
        return { update: () => ({ eq: () => ({ is: () => ({ select: () => Promise.resolve({ data: claimRows }) }) }) }) };
      }
      if (table === "orders") {
        return { select: () => ({ eq: () => Promise.resolve({ data: orders }) }) };
      }
      throw new Error("unexpected table " + table);
    },
  };
}

describe("runLaunchNotify", () => {
  it("搶佔成功 → 對去重 email 各寄一封", async () => {
    const sent = [];
    const sb = makeSupabase({ claimRows: [{ id: "default" }], orders: [
      { email: "a@x.com" }, { email: "b@x.com" }, { email: "a@x.com" },
    ]});
    const r = await runLaunchNotify(sb, { sendLaunchEmail: async ({ email }) => { sent.push(email); return { success: true }; } });
    expect(r).toEqual({ alreadyNotified: false, sent: 2 });
    expect(sent.sort()).toEqual(["a@x.com", "b@x.com"]);
  });

  it("CAS 搶佔失敗（已寄過）→ alreadyNotified、不寄信", async () => {
    const sent = [];
    const sb = makeSupabase({ claimRows: [], orders: [{ email: "a@x.com" }] });
    const r = await runLaunchNotify(sb, { sendLaunchEmail: async ({ email }) => { sent.push(email); return { success: true }; } });
    expect(r).toEqual({ alreadyNotified: true, sent: 0 });
    expect(sent).toEqual([]);
  });
});
