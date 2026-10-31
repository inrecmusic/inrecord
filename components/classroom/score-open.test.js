// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { scorePageUrl, getScoreOpenPref, setScoreOpenPref, markFromWatch, cameFromWatch } from "./score-open";

describe("score-open", () => {
  // 測試環境的 Node 內建 localStorage 不完整，換成記憶體版
  const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  beforeEach(() => { vi.stubGlobal("localStorage", mem()); vi.stubGlobal("sessionStorage", mem()); });
  afterEach(() => vi.unstubAllGlobals());
  it("整頁網址帶單元與樂譜 id；沒給樂譜就只帶單元", () => {
    expect(scorePageUrl("v1", "s1")).toBe("/classroom/score?v=v1&s=s1");
    expect(scorePageUrl("v1")).toBe("/classroom/score?v=v1");
  });
  it("記住的選擇只認 inline／page", () => {
    expect(getScoreOpenPref()).toBe(null);
    setScoreOpenPref("page");
    expect(getScoreOpenPref()).toBe("page");
    localStorage.setItem("inrec-score-open", "x");
    expect(getScoreOpenPref()).toBe(null);
    setScoreOpenPref(null);
    expect(localStorage.getItem("inrec-score-open")).toBe(null);
  });
  it("從影片頁換過來會留記號，返回鈕據此回上一頁", () => {
    expect(cameFromWatch()).toBe(false);
    markFromWatch();
    expect(cameFromWatch()).toBe(true);
  });
});
