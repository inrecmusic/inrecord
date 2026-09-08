import { describe, it, expect } from "vitest";
import { weeklyPeriod, rollingPeriod } from "./period.js";

describe("weeklyPeriod（台灣時間，週一 00:00 切）", () => {
  it("週一 08:00 台灣＝上週一 00:00 至本週一 00:00", () => {
    const p = weeklyPeriod(new Date("2026-09-14T00:00:00Z")); // 台灣 9/14（一）08:00
    expect(p.end.toISOString()).toBe("2026-09-13T16:00:00.000Z");   // 9/14 00:00 台灣
    expect(p.start.toISOString()).toBe("2026-09-06T16:00:00.000Z"); // 9/7 00:00 台灣
    expect(p.prevStart.toISOString()).toBe("2026-08-30T16:00:00.000Z");
    expect(p.label).toBe("9/7–9/13");
  });
  it("週日深夜（台灣 23:59）仍屬上一週", () => {
    const p = weeklyPeriod(new Date("2026-09-13T15:59:00Z")); // 台灣 9/13（日）23:59
    expect(p.end.toISOString()).toBe("2026-09-06T16:00:00.000Z");   // 9/7 00:00
    expect(p.label).toBe("8/31–9/6");
  });
});

describe("rollingPeriod（手動產生：過去 7 天到現在）", () => {
  it("end＝now、start＝7 天前、prevStart＝14 天前", () => {
    const now = new Date("2026-09-10T00:00:00Z");
    const p = rollingPeriod(now);
    expect(p.end.toISOString()).toBe("2026-09-10T00:00:00.000Z");
    expect(p.start.toISOString()).toBe("2026-09-03T00:00:00.000Z");
    expect(p.prevStart.toISOString()).toBe("2026-08-27T00:00:00.000Z");
    expect(p.label).toBe("9/3–9/10");
  });
});
