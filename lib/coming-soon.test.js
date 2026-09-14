import { describe, it, expect } from "vitest";
import { comingSoonLabel, releaseBatchFor } from "./coming-soon.js";

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

// 非早鳥（9/2 起購課）分兩批放行：9/30 第一批 Ch1～Ch3、10/31 完整上架。
// 側欄的章節日期表只看章號、不分早鳥，對非早鳥會比實際可看時間樂觀（Ch2 讀到早鳥日 9/23、Ch5 讀到 10/7），
// 所以要覆寫成他實際看得到的批次日；文案字串由 page.jsx 決定，這裡只驗批次判斷。
describe("releaseBatchFor：非早鳥側欄日期改顯示批次日", () => {
  const BEFORE = Date.parse("2026-09-20T12:00:00+08:00"); // 9/30 前
  const AFTER  = Date.parse("2026-10-05T12:00:00+08:00"); // 9/30 後、10/31 前

  it("9/30 前：Ch1～Ch3（含單元層有日期的 Ch1）一律第一批，Ch4 以後一律第二批", () => {
    expect(releaseBatchFor(1, false, BEFORE)).toBe("first");
    expect(releaseBatchFor(3, false, BEFORE)).toBe("first");
    expect(releaseBatchFor(4, false, BEFORE)).toBe("second");
    expect(releaseBatchFor(5, false, BEFORE)).toBe("second");
  });

  it("9/30 起：Ch1～Ch3 已放行、回歸章節日期表（null）；Ch4 以後仍是第二批", () => {
    expect(releaseBatchFor(2, false, AFTER)).toBe(null);
    expect(releaseBatchFor(5, false, AFTER)).toBe("second");
  });

  it("早鳥與 10/31 後（旗標 undefined）都不覆寫", () => {
    expect(releaseBatchFor(2, true, BEFORE)).toBe(null);
    expect(releaseBatchFor(5, true, BEFORE)).toBe(null);
    expect(releaseBatchFor(5, undefined, BEFORE)).toBe(null);
  });

  it("附錄（沒有 ChN、chNum 為 NaN）對非早鳥落在第二批", () => {
    expect(releaseBatchFor(NaN, false, BEFORE)).toBe("second");
  });
});
