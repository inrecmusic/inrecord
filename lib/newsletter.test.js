import { describe, it, expect } from "vitest";
import { mdToHtml, renderNewsletterHtml, renderAdminEmailHtml, dedupeEmails } from "./newsletter.js";

describe("renderAdminEmailHtml", () => {
  it("含主旨與渲染後內文、跳脫，且 footer 為中性句（非電子報的『你是學員』退訂句）", () => {
    const html = renderAdminEmailHtml({ subject: "您的訂單 <x>", bodyMd: "# 嗨\n**請完成付款**", siteUrl: "https://inrecordmusic.com" });
    expect(html).toContain("您的訂單 &lt;x&gt;");          // 主旨跳脫
    expect(html).toContain("<h1>嗨</h1>");                 // Markdown 標題
    expect(html).toContain("<strong>請完成付款</strong>"); // 粗體
    expect(html).toContain("直接回覆此信");                 // 中性 footer
    expect(html).not.toContain("你是 InRecord 的學員");     // 不含電子報會員退訂句
  });
});

describe("mdToHtml", () => {
  it("標題 # / ## / ###", () => {
    expect(mdToHtml("# 大標")).toBe("<h1>大標</h1>");
    expect(mdToHtml("## 中標")).toBe("<h2>中標</h2>");
    expect(mdToHtml("### 小標")).toBe("<h3>小標</h3>");
  });
  it("一般文字包成段落", () => {
    expect(mdToHtml("哈囉大家")).toBe("<p>哈囉大家</p>");
  });
  it("粗體 **x** 與斜體 *y*", () => {
    expect(mdToHtml("**重要**")).toBe("<p><strong>重要</strong></p>");
    expect(mdToHtml("*強調*")).toBe("<p><em>強調</em></p>");
  });
  it("連續 - 行併成 ul", () => {
    expect(mdToHtml("- 甲\n- 乙")).toBe("<ul><li>甲</li><li>乙</li></ul>");
  });
  it("--- 變分隔線", () => {
    expect(mdToHtml("---")).toBe("<hr>");
  });
  it("HTML 一律跳脫（防注入）", () => {
    expect(mdToHtml("<script>alert(1)</script>")).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
  });
  it("標題內也吃粗體", () => {
    expect(mdToHtml("# 歡迎 **學員**")).toBe("<h1>歡迎 <strong>學員</strong></h1>");
  });
  it("空行分隔、多區塊組合", () => {
    expect(mdToHtml("# 標題\n\n第一段\n\n- a\n- b\n\n---")).toBe(
      "<h1>標題</h1><p>第一段</p><ul><li>a</li><li>b</li></ul><hr>"
    );
  });
});

describe("renderNewsletterHtml", () => {
  const html = renderNewsletterHtml({ subject: "六月課程通知", bodyMd: "## 你好\n\n開課囉", siteUrl: "https://inrecordmusic.com" });
  it("含標題（已跳脫）", () => {
    expect(html).toContain("六月課程通知");
  });
  it("含內文轉出的 HTML", () => {
    expect(html).toContain("<h2>你好</h2>");
    expect(html).toContain("<p>開課囉</p>");
  });
  it("含退訂句", () => {
    expect(html).toContain("不想再收到");
  });
  it("subject 會 HTML 跳脫", () => {
    const h = renderNewsletterHtml({ subject: "<b>x</b>", bodyMd: "hi", siteUrl: "https://x" });
    expect(h).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(h).not.toContain("<b>x</b>");
  });
});

describe("dedupeEmails", () => {
  it("trim + 轉小寫 + 去重 + 濾掉空/無@", () => {
    expect(dedupeEmails([" A@B.com ", "a@b.com", "x@y.com", "", null, "bad", undefined]))
      .toEqual(["a@b.com", "x@y.com"]);
  });
  it("空輸入回空陣列", () => {
    expect(dedupeEmails([])).toEqual([]);
    expect(dedupeEmails(null)).toEqual([]);
  });
});
