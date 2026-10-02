import { describe, it, expect } from "vitest";
import { publicGame, injectEndSignal, END_SIGNAL, PUBLIC_GAMES } from "./public-games.js";

describe("publicGame 白名單", () => {
  it("只認白名單上的 slug，不分大小寫", () => {
    expect(publicGame("do")?.title).toBe("Do 給你找");
    expect(publicGame("DO")?.title).toBe("Do 給你找");
  });
  it("不在名單上的一律回 null（含空值與想撈付費遊戲的嘗試）", () => {
    for (const s of ["", null, undefined, "音名快閃", "../games", "1", "對照翻翻樂"]) {
      expect(publicGame(s)).toBeNull();
    }
  });
  it("名單目前只開兩款，其餘五款仍鎖在教室", () => {
    expect(Object.keys(PUBLIC_GAMES)).toEqual(["do", "flash"]);
    expect(publicGame("flash")?.title).toBe("音名快閃");
  });
});

describe("injectEndSignal", () => {
  it("注在 </body> 之前", () => {
    const out = injectEndSignal("<html><body><h1>x</h1></body></html>");
    expect(out.indexOf("scr-result")).toBeLessThan(out.indexOf("</body>"));
    expect(out).toContain(END_SIGNAL);
    expect(out).toContain("<h1>x</h1>");
  });
  it("同時盯「玩完」與「暫停」兩個訊號", () => {
    const out = injectEndSignal("<body></body>");
    expect(out).toContain("scr-result");
    expect(out).toContain("pauseMask");
  });
  it("沒有 </body> 就接在最後", () => {
    const out = injectEndSignal("<div>only</div>");
    expect(out.startsWith("<div>only</div>")).toBe(true);
    expect(out).toContain(END_SIGNAL);
  });
  it("大寫 </BODY> 也認得", () => {
    const out = injectEndSignal("<body>x</BODY>");
    expect(out.indexOf("MutationObserver")).toBeLessThan(out.indexOf("</BODY>"));
  });
  it("空內容原樣回傳，不注入（避免把空白頁變成有 script 的頁）", () => {
    expect(injectEndSignal("")).toBe("");
    expect(injectEndSignal(null)).toBe("");
  });
});
