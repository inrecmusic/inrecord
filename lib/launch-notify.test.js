import { describe, it, expect } from "vitest";
import { runLaunchNotify } from "./launch-notify.js";

// supabase mock：orders(.select.eq.range)、launch_notify_sends(.select.range / .insert / .delete.eq)、
// sale_settings(.update.eq.is)。range 是 selectAll 分頁用的收尾呼叫。
// claimConflicts：模擬「讀完名單之後、佔位之前」被另一路（cron／後台按鈕）搶走的 email。
function makeSupabase({ paid = [], alreadySent = [], ordersError = null, claimConflicts = [] }) {
  const recorded = new Set(alreadySent.map((e) => e.toLowerCase()));
  const conflicts = new Set(claimConflicts.map((e) => e.toLowerCase()));
  const state = { completedAt: null };
  const page = (rows, from, to) => rows.slice(from, to + 1);
  const sb = {
    from(table) {
      if (table === "orders") {
        const rows = (paid || []).map((e) => ({ email: e }));
        return {
          select: () => ({
            eq: () => ({
              range: (from, to) =>
                Promise.resolve(ordersError ? { data: null, error: ordersError } : { data: page(rows, from, to), error: null }),
            }),
          }),
        };
      }
      if (table === "launch_notify_sends") {
        return {
          select: () => ({
            range: (from, to) => Promise.resolve({ data: page([...recorded].map((e) => ({ email: e })), from, to), error: null }),
          }),
          insert: (row) => {
            const k = (row.email || "").toLowerCase();
            if (recorded.has(k) || conflicts.has(k)) return Promise.resolve({ error: { code: "23505" } });
            recorded.add(k);
            return Promise.resolve({ error: null });
          },
          delete: () => ({
            eq: (_col, val) => { recorded.delete(String(val).toLowerCase()); return Promise.resolve({ error: null }); },
          }),
        };
      }
      if (table === "sale_settings") {
        return { update: (patch) => ({ eq: () => ({ is: () => { state.completedAt = patch.launch_notified_at; return Promise.resolve({ data: [], error: null }); } }) }) };
      }
      throw new Error("unexpected table " + table);
    },
  };
  return { sb, recorded, state };
}

describe("runLaunchNotify", () => {
  it("對去重後的買家各寄一封、落寄送記錄、全部寄達 → 標記完成", async () => {
    const sent = [];
    const { sb, recorded, state } = makeSupabase({ paid: ["a@x.com", "b@x.com", "A@x.com"] });
    const r = await runLaunchNotify(sb, { sendLaunchEmail: async ({ email }) => { sent.push(email); return { success: true }; }, now: new Date("2026-09-03T00:00:00Z") });
    expect(sent.sort()).toEqual(["a@x.com", "b@x.com"]); // 大小寫去重
    expect(r.sent).toBe(2);
    expect(r.pending).toBe(0);
    expect(recorded.has("a@x.com")).toBe(true);
    expect(recorded.has("b@x.com")).toBe(true);
    expect(state.completedAt).toBe("2026-09-03T00:00:00.000Z");
  });

  it("斷點續寄：已寄過的 email 跳過、不重寄", async () => {
    const sent = [];
    const { sb } = makeSupabase({ paid: ["a@x.com", "b@x.com"], alreadySent: ["a@x.com"] });
    const r = await runLaunchNotify(sb, { sendLaunchEmail: async ({ email }) => { sent.push(email); return { success: true }; } });
    expect(sent).toEqual(["b@x.com"]);
    expect(r.sent).toBe(1);
    expect(r.pending).toBe(0);
  });

  it("部分寄送失敗 → 佔位退回、pending>0、不標記完成（可續寄）", async () => {
    const { sb, recorded, state } = makeSupabase({ paid: ["a@x.com", "b@x.com"] });
    const r = await runLaunchNotify(sb, { sendLaunchEmail: async ({ email }) => email === "b@x.com" ? { success: false, error: "brevo_500" } : { success: true } });
    expect(r.sent).toBe(1);
    expect(r.pending).toBe(1);
    expect(recorded.has("b@x.com")).toBe(false); // 失敗者佔位已刪 → 下次會再寄
    expect(state.completedAt).toBeNull();        // 未全部寄達 → 不標記完成
    expect(r.errors.length).toBe(1);
  });

  it("先佔位再寄：被另一路搶走的 email 不寄（skipped）、也不標記完成", async () => {
    const sent = [];
    const { sb, state } = makeSupabase({ paid: ["a@x.com", "b@x.com"], claimConflicts: ["b@x.com"] });
    const r = await runLaunchNotify(sb, { sendLaunchEmail: async ({ email }) => { sent.push(email); return { success: true }; } });
    expect(sent).toEqual(["a@x.com"]); // b 已被別人佔走 → 不會收到第二封
    expect(r.sent).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.pending).toBe(1);
    expect(state.completedAt).toBeNull();
  });

  it("全部已寄過 → 不寄、標記完成、alreadyComplete", async () => {
    const sent = [];
    const { sb, state } = makeSupabase({ paid: ["a@x.com"], alreadySent: ["a@x.com"], });
    const r = await runLaunchNotify(sb, { sendLaunchEmail: async ({ email }) => { sent.push(email); return { success: true }; }, now: new Date("2026-09-03T00:00:00Z") });
    expect(sent).toEqual([]);
    expect(r.alreadyComplete).toBe(true);
    expect(state.completedAt).toBe("2026-09-03T00:00:00.000Z");
  });

  it("買家超過 1000 筆 → 分頁撈完，第 1001 位之後照樣寄到", async () => {
    const paid = Array.from({ length: 1200 }, (_, i) => `u${i}@x.com`);
    const sent = [];
    const { sb } = makeSupabase({ paid });
    const r = await runLaunchNotify(sb, { sendLaunchEmail: async ({ email }) => { sent.push(email); return { success: true }; } });
    expect(r.total).toBe(1200);
    expect(r.sent).toBe(1200);
    expect(sent).toContain("u1100@x.com");
  });

  it("撈付款名單失敗 → 丟錯、不寄任何信", async () => {
    const sent = [];
    const { sb } = makeSupabase({ paid: null, ordersError: { message: "db down" } });
    await expect(runLaunchNotify(sb, { sendLaunchEmail: async ({ email }) => { sent.push(email); return { success: true }; } })).rejects.toThrow();
    expect(sent).toEqual([]);
  });

  it("沒有付款買家 → 不寄、不標記完成", async () => {
    const { sb, state } = makeSupabase({ paid: [] });
    const r = await runLaunchNotify(sb, { sendLaunchEmail: async () => ({ success: true }) });
    expect(r.total).toBe(0);
    expect(r.sent).toBe(0);
    expect(state.completedAt).toBeNull();
  });
});
