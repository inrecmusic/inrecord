import { describe, it, expect } from "vitest";
import { claimCronReport } from "./run.js";

const period = { start: new Date("2026-09-06T16:00:00Z"), end: new Date("2026-09-13T16:00:00Z"), prevStart: new Date("2026-08-30T16:00:00Z"), label: "9/7–9/13" };

// 只用到 insert().select().single() 與 select().eq().eq().maybeSingle() 兩條鏈
function stub({ insert, existing = null }) {
  const inserted = [];
  return {
    inserted,
    from: () => ({
      insert: (row) => { inserted.push(row); return { select: () => ({ single: async () => insert }) }; },
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existing }) }) }) }),
    }),
  };
}

describe("claimCronReport", () => {
  it("插得進去＝拿到這一期的佔位列", async () => {
    const sb = stub({ insert: { data: { id: "r1", model: null }, error: null } });
    expect(await claimCronReport(sb, period)).toEqual({ claimed: { id: "r1", model: null } });
    expect(sb.inserted[0]).toMatchObject({ triggered_by: "cron", period_end: "2026-09-13T16:00:00.000Z", report: {}, pack: {} });
  });

  it("撞唯一索引且那份已經產好 → 回傳既有的，不再跑模型", async () => {
    const done = { id: "r0", model: "claude-opus-5", created_at: new Date().toISOString() };
    const sb = stub({ insert: { data: null, error: { code: "23505" } }, existing: done });
    expect(await claimCronReport(sb, period)).toEqual({ existing: done });
  });

  it("撞唯一索引但對方是擱置超過 15 分鐘的空佔位 → 接手重跑", async () => {
    const stale = { id: "r0", model: null, created_at: new Date(Date.now() - 20 * 60 * 1000).toISOString() };
    const sb = stub({ insert: { data: null, error: { code: "23505" } }, existing: stale });
    expect(await claimCronReport(sb, period)).toEqual({ claimed: stale });
  });

  it("撞唯一索引且對方正在產生中（佔位不到 15 分鐘）→ 不接手", async () => {
    const fresh = { id: "r0", model: null, created_at: new Date().toISOString() };
    const sb = stub({ insert: { data: null, error: { code: "23505" } }, existing: fresh });
    expect(await claimCronReport(sb, period)).toEqual({ existing: fresh });
  });

  it("其他資料庫錯誤照樣往外丟", async () => {
    const sb = stub({ insert: { data: null, error: { code: "42P01", message: "relation does not exist" } } });
    await expect(claimCronReport(sb, period)).rejects.toThrow("relation does not exist");
  });
});
