import { describe, it, expect } from "vitest";
import { runLaunchNotify } from "./launch-notify.js";

// supabase mock：sale_settings CAS 搶佔 + 還原；orders 查詢（可注入 error）。
function makeSupabase({ claimRows, orders, ordersError = null }) {
  const rollback = { called: false };
  const sb = {
    from(table) {
      if (table === "sale_settings") {
        return {
          update(patch) {
            return {
              eq() {
                // 同一個回傳物件既能 await（還原路徑），也能繼續 .is().select()（搶佔路徑）。
                return {
                  is: () => ({ select: () => Promise.resolve({ data: claimRows }) }),
                  then: (onF, onR) => {
                    if (patch.launch_notified_at === null) rollback.called = true;
                    return Promise.resolve({ error: null }).then(onF, onR);
                  },
                };
              },
            };
          },
        };
      }
      if (table === "orders") {
        return { select: () => ({ eq: () => Promise.resolve({ data: orders, error: ordersError }) }) };
      }
      throw new Error("unexpected table " + table);
    },
  };
  return { sb, rollback };
}

describe("runLaunchNotify", () => {
  it("搶佔成功 → 對去重 email 各寄一封", async () => {
    const sent = [];
    const { sb } = makeSupabase({ claimRows: [{ id: "default" }], orders: [
      { email: "a@x.com" }, { email: "b@x.com" }, { email: "a@x.com" },
    ]});
    const r = await runLaunchNotify(sb, { sendLaunchEmail: async ({ email }) => { sent.push(email); return { success: true }; } });
    expect(r).toEqual({ alreadyNotified: false, sent: 2 });
    expect(sent.sort()).toEqual(["a@x.com", "b@x.com"]);
  });

  it("CAS 搶佔失敗（已寄過）→ alreadyNotified、不寄信", async () => {
    const sent = [];
    const { sb } = makeSupabase({ claimRows: [], orders: [{ email: "a@x.com" }] });
    const r = await runLaunchNotify(sb, { sendLaunchEmail: async ({ email }) => { sent.push(email); return { success: true }; } });
    expect(r).toEqual({ alreadyNotified: true, sent: 0 });
    expect(sent).toEqual([]);
  });

  it("搶佔成功但撈付款名單失敗 → 還原旗標並丟錯（不可永久不寄）", async () => {
    const sent = [];
    const { sb, rollback } = makeSupabase({
      claimRows: [{ id: "default" }], orders: null, ordersError: { message: "db down" },
    });
    await expect(
      runLaunchNotify(sb, { sendLaunchEmail: async ({ email }) => { sent.push(email); return { success: true }; } })
    ).rejects.toThrow();
    expect(sent).toEqual([]);            // 一封都沒寄
    expect(rollback.called).toBe(true);  // launch_notified_at 已還原 → 下次 cron/手動可重試
  });
});
