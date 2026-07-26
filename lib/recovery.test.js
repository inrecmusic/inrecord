import { describe, it, expect } from "vitest";
import { selectRecoveryCandidates, buildRecoveryEmail } from "./recovery.js";

const now = new Date("2026-07-27T12:00:00Z");
const iso = (hoursAgo) => new Date(now.getTime() - hoursAgo * 3600 * 1000).toISOString();
const base = { status: "pending", email: "a@b.com", recovery_sent_at: null };

describe("selectRecoveryCandidates", () => {
  it("選中時間窗(6-48h)內、未寄過的 pending", () => {
    const r = selectRecoveryCandidates([{ ...base, id: 1, created_at: iso(7) }], now);
    expect(r.map((o) => o.id)).toEqual([1]);
  });
  it("排除太新(<6h)與太舊(>48h)", () => {
    const r = selectRecoveryCandidates([
      { ...base, id: 1, created_at: iso(3) },
      { ...base, id: 2, created_at: iso(50) },
      { ...base, id: 3, created_at: iso(24) },
    ], now);
    expect(r.map((o) => o.id)).toEqual([3]);
  });
  it("排除非 pending / 已寄過 / 無 email", () => {
    const r = selectRecoveryCandidates([
      { ...base, id: 1, created_at: iso(7), status: "paid" },
      { ...base, id: 2, created_at: iso(7), recovery_sent_at: iso(1) },
      { ...base, id: 3, created_at: iso(7), email: null },
    ], now);
    expect(r).toEqual([]);
  });
  it("空輸入不炸", () => expect(selectRecoveryCandidates(null, now)).toEqual([]));
});

describe("buildRecoveryEmail", () => {
  it("含方案名與帶 UTM 的 CTA", () => {
    const { subject, html } = buildRecoveryEmail({ planLabel: "學琴全攻略" });
    expect(subject).toContain("還沒完成");
    expect(html).toContain("學琴全攻略");
    expect(html).toContain("utm_campaign=abandoned_recovery");
  });
  it("跳脫 planLabel 中的 HTML（防注入）", () => {
    const { html } = buildRecoveryEmail({ planLabel: "<script>x</script>" });
    expect(html).not.toContain("<script>x");
    expect(html).toContain("&lt;script&gt;");
  });
});
