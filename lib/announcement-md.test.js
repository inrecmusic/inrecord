import { describe, it, expect } from "vitest";
import { announcementHtml } from "./announcement-md.js";

// 公告內容：共用電子報的受限 Markdown（粗體／條列／[文字](網址)），外加裸網址自動變連結。
// 輸出給 dangerouslySetInnerHTML，所以跳脫是硬需求。
describe("announcementHtml", () => {
  it("粗體、條列、連結", () => {
    const html = announcementHtml("**9/9 晚上 8 點**開放\n\n- 講義先下載\n- 邊看邊寫\n\n[官網](https://inrecordmusic.com)");
    expect(html).toContain("<strong>9/9 晚上 8 點</strong>");
    expect(html).toContain("<ul><li>講義先下載</li><li>邊看邊寫</li></ul>");
    expect(html).toContain('<a href="https://inrecordmusic.com"');
    expect(html).toContain(">官網</a>");
  });

  it("裸網址自動變成可點連結；已是 [文字](網址) 的不會被包兩次", () => {
    const html = announcementHtml("看 https://inrecordmusic.com/#faq 就好");
    expect(html).toContain('<a href="https://inrecordmusic.com/#faq"');
    expect(html).toContain(">https://inrecordmusic.com/#faq</a>");
    const once = announcementHtml("[常見問題](https://inrecordmusic.com/#faq)");
    expect(once.match(/<a /g)).toHaveLength(1);
    expect(once).toContain(">常見問題</a>");
  });

  it("HTML 一律跳脫、javascript: 連結不產生 <a>", () => {
    const html = announcementHtml("<script>alert(1)</script> [x](javascript:alert(1))");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<a ");
  });

  it("不夾帶 email 用的 inline style（深色主題要靠 CSS 上色）", () => {
    expect(announcementHtml("**粗** [a](https://a.b)")).not.toMatch(/style=/);
  });

  it("空值回空字串", () => {
    expect(announcementHtml("")).toBe("");
    expect(announcementHtml(null)).toBe("");
  });
});
