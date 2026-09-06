import { describe, it, expect } from "vitest";
import { comingSoonLabel } from "./coming-soon.js";

// 側欄「預計 M/D 上架」文案：日期一過（台灣時間）影片還沒掛上 → 改顯示「即將上架」，避免學員看到跳票日期。
describe("comingSoonLabel", () => {
  const at = (iso) => new Date(iso); // 用 UTC 時間造「台灣當天」邊界

  it("日期還沒到 → 照原文案", () => {
    expect(comingSoonLabel("預計 9/9 上架", at("2026-09-05T12:00:00Z"))).toBe("預計 9/9 上架");
  });

  it("當天仍算預計（台灣 9/5 整天）", () => {
    expect(comingSoonLabel("預計 9/5 上架", at("2026-09-05T15:59:00Z"))).toBe("預計 9/5 上架"); // 台灣 9/5 23:59
  });

  it("日期過了 → 即將上架（台灣 9/6 00:00 起）", () => {
    expect(comingSoonLabel("預計 9/5 上架", at("2026-09-05T16:00:00Z"))).toBe("即將上架"); // 台灣 9/6 00:00
    expect(comingSoonLabel("預計 9/5 上架", at("2026-09-06T06:00:00Z"))).toBe("即將上架");
  });

  it("沒有日期的文案原樣回傳；空值不炸", () => {
    expect(comingSoonLabel("準備中")).toBe("準備中");
    expect(comingSoonLabel("")).toBe("");
    expect(comingSoonLabel(null)).toBe(null);
  });
});
