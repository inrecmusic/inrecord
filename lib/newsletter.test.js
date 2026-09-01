import { describe, it, expect } from "vitest";
import { mdToHtml, renderNewsletterHtml, renderAdminEmailHtml, dedupeEmails } from "./newsletter.js";

describe("renderAdminEmailHtml", () => {
  it("含主旨與渲染後內文、跳脫，且 footer 為中性句（非電子報的『你是學員』退訂句）", () => {
    const html = renderAdminEmailHtml({ subject: "您的訂單 <x>", bodyMd: "# 嗨\n**請完成付款**", siteUrl: "https://inrecordmusic.com" });
    expect(html).toContain("您的訂單 &lt;x&gt;");          // 主旨跳脫
    expect(html).toContain(">嗨</h1>");                 // Markdown 標題
    expect(html).toContain(">請完成付款</strong>"); // 粗體
    expect(html).toContain("直接回覆此信");                 // 中性 footer
    expect(html).not.toContain("你是 InRecord 的學員");     // 不含電子報會員退訂句
  });
});

describe("mdToHtml", () => {
  it("標題 # / ## / ###", () => {
    expect(mdToHtml("# 大標")).toContain(">大標</h1>");
    expect(mdToHtml("## 中標")).toContain(">中標</h2>");
    expect(mdToHtml("## 中標")).toContain("border-left:3px solid #2563eb"); // h2 inline 藍條
    expect(mdToHtml("### 小標")).toContain(">小標</h3>");
  });
  it("一般文字包成段落", () => {
    expect(mdToHtml("哈囉大家")).toContain(">哈囉大家</p>");
  });
  it("粗體 **x** 與斜體 *y*", () => {
    expect(mdToHtml("**重要**")).toContain("<strong style=\"color:#0f172a;\">重要</strong>");
    expect(mdToHtml("*強調*")).toContain("<em>強調</em>");
  });
  it("連續 - 行併成 ul", () => {
    expect(mdToHtml("- 甲\n- 乙")).toContain("甲</div>");
    expect(mdToHtml("- 甲\n- 乙")).toContain(">›</span>乙</div>");
  });
  it("--- 變分隔線", () => {
    expect(mdToHtml("---")).toContain("<hr style=");
  });
  it("HTML 一律跳脫（防注入）", () => {
    expect(mdToHtml("<script>alert(1)</script>")).toContain(">&lt;script&gt;alert(1)&lt;/script&gt;</p>");
  });
  it("標題內也吃粗體", () => {
    expect(mdToHtml("# 歡迎 **學員**")).toContain(">歡迎 <strong style=\"color:#0f172a;\">學員</strong></h1>");
  });
  it("空行分隔、多區塊組合", () => {
    const combo = mdToHtml("# 標題\n\n第一段\n\n- a\n- b\n\n---");
    expect(combo).toContain(">標題</h1>");
    expect(combo).toContain(">第一段</p>");
    expect(combo).toContain(">›</span>a</div>");
    expect(combo).toContain("<hr style=");
  });
});

describe("renderNewsletterHtml", () => {
  const html = renderNewsletterHtml({ subject: "六月課程通知", bodyMd: "## 你好\n\n開課囉", siteUrl: "https://inrecordmusic.com" });
  it("含標題（已跳脫）", () => {
    expect(html).toContain("六月課程通知");
  });
  it("含內文轉出的 HTML", () => {
    expect(html).toContain(">你好</h2>");
    expect(html).toContain(">開課囉</p>");
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

describe("mdToHtml 連結與按鈕", () => {
  it("行內 [文字](網址) 轉成 <a>", () => {
    expect(mdToHtml("請看 [課程頁](https://inrecordmusic.com/#curriculum) 了解"))
      .toContain('<a href="https://inrecordmusic.com/#curriculum" style="color:#2563eb;">課程頁</a>');
  });
  it("非 http(s) scheme 不產生連結（防 javascript:）", () => {
    const h = mdToHtml("[點我](javascript:alert(1))");
    expect(h).not.toContain("<a ");
    expect(h).toContain("[點我](javascript:alert(1))");
  });
  it("整行只有一個連結 → 防彈 table 按鈕（藍底白字）", () => {
    const h = mdToHtml("[進入教室](https://inrecordmusic.com/classroom)");
    expect(h).toContain('bgcolor="#2563eb"');       // td 藍底
    expect(h).toContain("color:#ffffff");            // 白字
    expect(h).toContain("border-radius:999px");
    expect(h).toContain(">進入教室</a>");
  });
  it("連結前後有文字則不是按鈕、是行內連結", () => {
    const h = mdToHtml("點這裡 [進入教室](https://inrecordmusic.com/classroom) 開始上課");
    expect(h).not.toContain('bgcolor="#2563eb"');
    expect(h).toContain('style="color:#2563eb;"');
  });
  it("連結文字內的粗體仍生效", () => {
    expect(mdToHtml("[**立即**報名](https://x.com/a)")).toContain(">立即</strong>報名");
  });
});

describe("時間軸卡片 :::timeline", () => {
  it("區塊轉成藍圈卡片，dim 列灰階、次文字顯示", () => {
    const h = mdToHtml(":::timeline\n9/2 | 第一章 | 晚上 8:00\n9/30 | 全數開放 | dim\n:::");
    expect(h).toContain("background-color:#eff4ff");        // 卡片底色
    expect(h).toContain(">9/2</td>");                        // 徽章
    expect(h).toContain(">第一章</div>");                    // 標題
    expect(h).toContain("晚上 8:00");                        // 次文字
    expect(h).toContain("bgcolor=\"#cbd5e1\"");             // dim 圈灰
    expect(h).toContain("color:#94a3b8");                    // dim 標題灰
    expect(h).not.toContain(">dim</div>");                   // dim 不當標題/次文字輸出
  });
  it("4 字以上徽章縮字級塞圓圈", () => {
    expect(mdToHtml(":::timeline\n9/16 | 第三章\n:::")).toContain("font-size:11px");
    expect(mdToHtml(":::timeline\n9/2 | 第一章\n:::")).toContain("font-size:12px");
  });
  it("未收尾的區塊也會輸出卡片（容錯）", () => {
    expect(mdToHtml(":::timeline\n9/9 | 第二章")).toContain("background-color:#eff4ff");
  });
});

describe("頁首 @badge / @subtitle", () => {
  it("開頭指令 → 頁首膠囊徽章＋副標，不出現在內文", () => {
    const h = renderNewsletterHtml({ subject: "開課囉", bodyMd: "@badge 上架公告\n@subtitle 早鳥可搶先看\n\n內文段落" });
    expect(h).toContain(">上架公告</td>");        // 徽章膠囊
    expect(h).toContain(">早鳥可搶先看</p>");      // 副標
    expect(h).toContain(">內文段落</p>");          // 內文照常
    expect(h).not.toContain("@badge");             // 指令被吃掉
    expect(h).not.toContain("@subtitle");
  });
  it("無指令時頁首與原本一致（既有電子報不受影響）", () => {
    const h = renderNewsletterHtml({ subject: "一般消息", bodyMd: "第一段\n\n第二段" });
    expect(h).not.toContain("border-radius:999px;padding:5px 15px"); // 無徽章膠囊
    expect(h).toContain(">第一段</p>");
  });
});

describe("品牌外框（Logo header）", () => {
  it("電子報與自訂信都有深色頁首＋白字 Logo＋標題反白＋品牌列", () => {
    const nl = renderNewsletterHtml({ subject: "開課通知", bodyMd: "hi" });
    const ad = renderAdminEmailHtml({ subject: "訂單確認", bodyMd: "hi" });
    for (const h of [nl, ad]) {
      expect(h).toContain('bgcolor="#0f172a"');                                  // 深色頁首
      expect(h).toContain('src="https://inrecordmusic.com/logo-wordmark-white.png"'); // 白字 Logo
      expect(h).toContain("InRecord・音樂刻");
    }
    expect(nl).toContain(">開課通知</h1>");    // 標題在頁首
    expect(ad).toContain(">訂單確認</h1>");
    // footer 差異仍在
    expect(nl).toContain("不想再收到");
    expect(ad).toContain("直接回覆此信");
  });
  it("siteUrl 覆寫時白字 Logo 跟著換 host", () => {
    const h = renderNewsletterHtml({ subject: "x", bodyMd: "hi", siteUrl: "https://preview.example" });
    expect(h).toContain('src="https://preview.example/logo-wordmark-white.png"');
  });
});
