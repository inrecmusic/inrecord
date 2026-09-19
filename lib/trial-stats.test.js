import { describe, it, expect } from "vitest";
import { buildTrialStats } from "./trial-stats.js";

const now = Date.parse("2026-09-20T12:00:00+08:00");
const row = (iso, email = "a@x.com", status = "sent") => ({ to_email: email, status, created_at: iso });

describe("buildTrialStats", () => {
  it("以台灣時間切日：凌晨的領取算當天，不會掉到前一天", () => {
    const s = buildTrialStats([row("2026-09-20T01:00:00+08:00")], { days: 7, nowMs: now });
    expect(s.series.at(-1)).toMatchObject({ day: "2026-09-20", sent: 1, people: 1 });
  });

  it("同一人重複領取：封數算兩次、人數只算一個", () => {
    const s = buildTrialStats([
      row("2026-09-20T09:00:00+08:00", "a@x.com"),
      row("2026-09-20T10:00:00+08:00", "A@X.com"),
    ], { days: 7, nowMs: now });
    expect(s.series.at(-1)).toMatchObject({ sent: 2, people: 1 });
    expect(s.totals).toMatchObject({ sent: 2, people: 1 });
  });

  it("寄送失敗另外計，不算進領取人數", () => {
    const s = buildTrialStats([row("2026-09-20T09:00:00+08:00", "bad@x.com", "failed")], { days: 7, nowMs: now });
    expect(s.series.at(-1)).toMatchObject({ sent: 0, people: 0, failed: 1 });
    expect(s.totals.failed).toBe(1);
  });

  it("沒有領取的日子補 0，序列長度等於天數", () => {
    const s = buildTrialStats([], { days: 30, nowMs: now });
    expect(s.series).toHaveLength(30);
    expect(s.series.every((d) => d.people === 0)).toBe(true);
  });

  it("近 7 天 vs 前 7 天的變化率；前一週是 0 時不給百分比", () => {
    const mk = (offset, n) => Array.from({ length: n }, () =>
      row(new Date(now - offset * 86400_000).toISOString(), `u${Math.random()}@x.com`));
    const s = buildTrialStats([...mk(1, 6), ...mk(9, 3)], { days: 30, nowMs: now });
    expect(s.last7).toBe(6);
    expect(s.prev7).toBe(3);
    expect(s.changePct).toBe(100);
    expect(buildTrialStats(mk(1, 5), { days: 30, nowMs: now }).changePct).toBe(null);
  });

  it("壞時間戳與空輸入不丟例外", () => {
    expect(() => buildTrialStats([{ created_at: "nope" }, null], { nowMs: now })).not.toThrow();
    expect(buildTrialStats(null, { nowMs: now }).totals.sent).toBe(0);
  });
});
