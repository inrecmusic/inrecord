import { describe, it, expect } from "vitest";
import { buildHtml, buildLaunchHtml } from "./brevo-email.js";

describe("buildHtml presale 分支", () => {
  const args = { planLabel: "學琴全攻略", planUnlock: "課程＋AI", merTradeNo: "INREC1", loginUrl: "https://x/login" };
  it("presale=true → 預購文案、無登入按鈕", () => {
    const html = buildHtml({ ...args, presale: true });
    expect(html).toContain("預購成功");
    expect(html).not.toContain(args.loginUrl);
  });
  it("presale=false → 開通文案、含登入按鈕", () => {
    const html = buildHtml({ ...args, presale: false });
    expect(html).toContain("購買成功");
    expect(html).toContain(args.loginUrl);
  });
});

describe("buildLaunchHtml", () => {
  it("含開課文案與登入連結", () => {
    const html = buildLaunchHtml({ loginUrl: "https://inrecordmusic.com/classroom/login" });
    expect(html).toContain("課程正式開課囉");
    expect(html).toContain("https://inrecordmusic.com/classroom/login");
  });
  it("loginUrl 正確插入 href", () => {
    const url = "https://example.com/login";
    const html = buildLaunchHtml({ loginUrl: url });
    expect(html).toContain(`href="${url}"`);
  });
});
