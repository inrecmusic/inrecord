import { describe, it, expect } from "vitest";
import { escapeHtml, escClip } from "./html-escape.js";

describe("html-escape", () => {
  it("escapeHtml 跳脫 & < > \" '，null/undefined 當空字串", () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;");
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(123)).toBe("123");
  });

  it("escClip 先截長再跳脫（預設 200 字）", () => {
    expect(escClip("<b>".repeat(100), 5)).toBe("&lt;b&gt;&lt;b");
    expect(escClip("x".repeat(300)).length).toBe(200);
    expect(escClip(null)).toBe("");
  });
});
