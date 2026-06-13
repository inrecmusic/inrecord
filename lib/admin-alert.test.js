import { describe, it, expect } from "vitest";
import { buildAdminAlertHtml } from "./admin-alert.js";

const order = { mer_trade_no: "INREC123", email: "buyer@example.com" };

describe("buildAdminAlertHtml", () => {
  it("invoice：主旨/內文含訂單編號、email、原因，且標示『發票』", () => {
    const { subject, html } = buildAdminAlertHtml({ kind: "invoice", order, reason: "amego_9001" });
    expect(subject).toContain("INREC123");
    expect(subject).toContain("發票");
    expect(html).toContain("INREC123");
    expect(html).toContain("buyer@example.com");
    expect(html).toContain("amego_9001");
    expect(html).toContain("發票");
  });

  it("email：標示『開課信』", () => {
    const { subject, html } = buildAdminAlertHtml({ kind: "email", order, reason: "brevo_500" });
    expect(subject).toContain("開課信");
    expect(html).toContain("開課信");
    expect(html).toContain("brevo_500");
  });

  it("缺欄位不丟例外、以 '-' / '未知' 預設", () => {
    const { subject, html } = buildAdminAlertHtml({ kind: "invoice", order: {}, reason: "" });
    expect(subject).toContain("-");
    expect(html).toContain("未知");
  });

  it("HTML 跳脫：買家輸入不會注入標籤", () => {
    const evil = { mer_trade_no: "INREC1", email: "<script>alert(1)</script>x@y.com" };
    const { html } = buildAdminAlertHtml({ kind: "invoice", order: evil, reason: "<img src=x onerror=alert(2)>" });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
  });
});
