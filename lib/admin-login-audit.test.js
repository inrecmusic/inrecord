import { describe, it, expect } from "vitest";
import { buildLoginAlertHtml } from "./admin-login-audit.js";

describe("buildLoginAlertHtml", () => {
  it("帶入時間／IP／登入方式／瀏覽器", () => {
    const { subject, html } = buildLoginAlertHtml({
      ip: "1.2.3.4", ua: "Mozilla/5.0 Safari", method: "password", whenLabel: "2026/8/26 上午10:00:00",
    });
    expect(subject).toContain("後台從新的位置登入");
    expect(html).toContain("1.2.3.4");
    expect(html).toContain("帳號密碼");
    expect(html).toContain("Mozilla/5.0 Safari");
    expect(html).toContain("2026/8/26 上午10:00:00");
  });

  it("google 方式顯示為「Google 登入」", () => {
    const { html } = buildLoginAlertHtml({ ip: "8.8.8.8", ua: "x", method: "google", whenLabel: "t" });
    expect(html).toContain("Google 登入");
  });

  it("跳脫 IP／UA 的 HTML（標頭可被攻擊者控制，防信件內 HTML 注入）", () => {
    const { html } = buildLoginAlertHtml({
      ip: '1.1.1.1"><script>alert(1)</script>',
      ua: "<img src=x onerror=alert(2)>",
      method: "password", whenLabel: "t",
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
  });

  it("缺 IP 時顯示「未知」、UA 過長會截斷", () => {
    const { html } = buildLoginAlertHtml({ ip: null, ua: "U".repeat(500), method: "password", whenLabel: "t" });
    expect(html).toContain("未知");
    expect(html).not.toContain("U".repeat(301)); // UA 上限 300
  });
});
