import { describe, it, expect } from "vitest";
import { pickAllowedDeviceIds, buildWatermark, exceedsDeviceLimit } from "./game-devices";

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
  it("email 含 HTML 特殊字元時被 escape（防 XSS）", () => {
    const html = buildWatermark("<script>@x.com", "2026-08-12");
    expect(html).not.toContain("<script>@x.com");
    expect(html).toContain("&lt;script&gt;@x.com");
  });
});

describe("exceedsDeviceLimit", () => {
  // 固定時間點，勿用 Date.now()
  const NOW = new Date("2026-08-12T12:00:00Z").getTime();
  const WINDOW = 30 * 60 * 1000; // 30 分鐘
  const activeAt = (id, minsAgo) => ({
    device_id: id,
    last_seen_at: new Date(NOW - minsAgo * 60 * 1000).toISOString(),
  });

  it("其他活躍裝置數 < limit → false（放行）", () => {
    const devices = [activeAt("a", 5), activeAt("current", 0)];
    // limit=2，其他活躍(a)=1 台 < 2
    expect(exceedsDeviceLimit(devices, "current", 2, NOW, WINDOW)).toBe(false);
  });

  it("其他活躍裝置數 ≥ limit → true（擋，當前是第 limit+1 台）", () => {
    const devices = [activeAt("a", 5), activeAt("b", 10), activeAt("current", 0)];
    // limit=2，其他活躍(a,b)=2 台 ≥ 2 → 當前(第3台)被擋
    expect(exceedsDeviceLimit(devices, "current", 2, NOW, WINDOW)).toBe(true);
  });

  it("超窗（last_seen 早於 cutoff）的裝置不算活躍 → 換裝置不誤傷 → false", () => {
    const devices = [activeAt("old1", 60), activeAt("old2", 45), activeAt("current", 0)];
    // limit=2，old1/old2 皆超過 30 分鐘窗口 → 視為 0 台其他活躍 → 放行
    expect(exceedsDeviceLimit(devices, "current", 2, NOW, WINDOW)).toBe(false);
  });

  it("當前裝置自己不計入（currentDeviceId 被排除）", () => {
    const devices = [activeAt("current", 2)]; // 名單內只有自己、且在窗口內
    expect(exceedsDeviceLimit(devices, "current", 1, NOW, WINDOW)).toBe(false);
  });
});
