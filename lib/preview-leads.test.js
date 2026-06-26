import { describe, it, expect } from "vitest";
import { buildLeadPatch } from "./preview-leads.js";

const NOW = new Date("2026-06-26T00:00:00.000Z");

describe("buildLeadPatch", () => {
  it("沒帶 status → patch 不含 status（不覆寫既有狀態），也不含 id", () => {
    const p = buildLeadPatch({ id: "L1", note: "hi" }, NOW);
    expect(p).not.toHaveProperty("status");
    expect(p).not.toHaveProperty("id");
    expect(p.note).toBe("hi");
    expect(p.updated_at).toBe(NOW.toISOString());
  });

  it("status=demo_opened → 帶 demo_opened 旗標與時間", () => {
    const p = buildLeadPatch({ id: "L1", status: "demo_opened" }, NOW);
    expect(p.status).toBe("demo_opened");
    expect(p.demo_opened).toBe(true);
    expect(p.demo_opened_at).toBe(NOW.toISOString());
  });

  it("status=purchased → 帶 purchased 旗標與時間", () => {
    const p = buildLeadPatch({ id: "L1", status: "purchased" }, NOW);
    expect(p.status).toBe("purchased");
    expect(p.purchased).toBe(true);
    expect(p.purchased_at).toBe(NOW.toISOString());
  });

  it("保留呼叫端帶入的 demo_opened_at（不覆寫）", () => {
    const p = buildLeadPatch(
      { id: "L1", status: "demo_opened", demo_opened_at: "2026-01-01T00:00:00.000Z" },
      NOW
    );
    expect(p.demo_opened_at).toBe("2026-01-01T00:00:00.000Z");
  });
});
