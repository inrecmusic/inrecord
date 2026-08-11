import { describe, it, expect } from "vitest";
import { pickAllowedDeviceIds, buildWatermark } from "./game-devices";

describe("pickAllowedDeviceIds", () => {
  const d = (id, t) => ({ device_id: id, last_seen_at: t });
  it("裝置數 ≤ limit：全部允許", () => {
    const out = pickAllowedDeviceIds([d("a","2026-08-01"), d("b","2026-08-02")], 3);
    expect(out.sort()).toEqual(["a","b"]);
  });
  it("裝置數 > limit：只留最新 N（依 last_seen_at）", () => {
    const out = pickAllowedDeviceIds(
      [d("old","2026-08-01"), d("mid","2026-08-05"), d("new","2026-08-10"), d("older","2026-07-01")], 2);
    expect(out).toEqual(["new","mid"]);
  });
  it("空陣列 → 空", () => {
    expect(pickAllowedDeviceIds([], 3)).toEqual([]);
  });
});

describe("buildWatermark", () => {
  it("含 email 與日期、且為多處（≥2 個 div）", () => {
    const html = buildWatermark("a@x.com", "2026-08-12");
    expect(html).toContain("a@x.com");
    expect(html).toContain("2026-08-12");
    expect((html.match(/<div/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});
