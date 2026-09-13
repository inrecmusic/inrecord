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

// 非早鳥（9/2 起購課）在 10/31 前只開放第一批 Ch1～Ch3。
// 側欄的章節日期表只看章號、不分早鳥，對非早鳥會比實際可看時間樂觀
//（例如 10/1 看 Ch5 讀到「預計 10/7 上架」，但他要等 10/31），所以要覆寫成第二批日期。
describe("側欄日期：非早鳥的第四章以後改顯示第二批", () => {
  const COMING_SOON = "預計 10/31 上架";
  const TABLE = { 2: "預計 9/23 上架", 3: "預計 9/23 上架", 4: "預計 9/30 上架", 5: "預計 10/7 上架" };
  const pick = (chNum, early) => (early === false && Number.isFinite(chNum) && chNum > 3 ? COMING_SOON : TABLE[chNum] || COMING_SOON);

  it("非早鳥：Ch1～Ch3 照原日期，Ch4 以後一律 10/31", () => {
    expect(pick(3, false)).toBe("預計 9/23 上架");
    expect(pick(4, false)).toBe(COMING_SOON);
    expect(pick(5, false)).toBe(COMING_SOON);
  });

  it("早鳥與 10/31 後（旗標 undefined）都不覆寫", () => {
    expect(pick(5, true)).toBe("預計 10/7 上架");
    expect(pick(5, undefined)).toBe("預計 10/7 上架");
  });

  it("附錄（沒有 ChN、chNum 為 NaN）本來就落在 10/31，不受影響", () => {
    expect(pick(NaN, false)).toBe(COMING_SOON);
  });
});
