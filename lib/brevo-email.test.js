import { describe, it, expect, vi, afterEach } from "vitest";
import { buildHtml, buildLaunchHtml, sendNewsletterEmail } from "./brevo-email.js";

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

describe("buildHtml 金額與開放時程", () => {
  const args = { planLabel: "學琴全攻略", planUnlock: "課程＋AI", merTradeNo: "INREC1", loginUrl: "https://x/login", presale: true };
  const before = Date.parse("2026-09-20T00:00:00+08:00");
  const after = Date.parse("2026-11-01T00:00:00+08:00");

  it("有金額 → 顯示實付金額（千分位）", () => {
    expect(buildHtml({ ...args, amount: 3999, nowMs: before })).toContain("NT$3,999");
  });

  it("金額 0／未提供 → 不顯示那一列（手動開通單不該寄出 NT$0）", () => {
    expect(buildHtml({ ...args, amount: 0, nowMs: before })).not.toContain("實付金額");
    expect(buildHtml({ ...args, nowMs: before })).not.toContain("實付金額");
  });

  it("全部章節上架前 → 顯示兩段開放時程", () => {
    const html = buildHtml({ ...args, amount: 3999, nowMs: before });
    expect(html).toContain("課程開放時程");
    expect(html).toContain("第 1～3 章");
    expect(html).toContain("全部章節");
  });

  it("全部章節上架後 → 時程區塊自動消失", () => {
    expect(buildHtml({ ...args, amount: 3999, nowMs: after })).not.toContain("課程開放時程");
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

describe("sendNewsletterEmail", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  function stub() {
    vi.stubEnv("BREVO_API_KEY", "k"); vi.stubEnv("BREVO_SENDER_EMAIL", "support@inrecordmusic.com");
    const calls = [];
    vi.stubGlobal("fetch", async (url, opts) => { calls.push({ url, body: JSON.parse(opts.body) }); return { ok: true, status: 201, json: async () => ({ messageId: "m1" }) }; });
    return calls;
  }
  it("預設走 subject/htmlContent", async () => {
    const calls = stub();
    const r = await sendNewsletterEmail({ to: "a@x.com", subject: "S", html: "<p>H</p>" });
    expect(r.success).toBe(true);
    expect(calls[0].body).toMatchObject({ subject: "S", htmlContent: "<p>H</p>", to: [{ email: "a@x.com" }] });
    expect(calls[0].body.templateId).toBeUndefined();
  });
  it("給 templateId → 改送 templateId（不帶 subject/htmlContent），params 可選", async () => {
    const calls = stub();
    const r = await sendNewsletterEmail({ to: "a@x.com", templateId: 3, params: { name: "小明" } });
    expect(r.success).toBe(true);
    expect(calls[0].body.templateId).toBe(3);
    expect(calls[0].body.params).toEqual({ name: "小明" });
    expect(calls[0].body.subject).toBeUndefined();
    expect(calls[0].body.htmlContent).toBeUndefined();
    expect(calls[0].body.replyTo.email).toBe("support@inrecordmusic.com");
  });
  it("給 unsubscribeUrl → 帶 List-Unsubscribe／List-Unsubscribe-Post 標頭", async () => {
    const calls = stub();
    await sendNewsletterEmail({ to: "a@x.com", subject: "S", html: "<p>H</p>", unsubscribeUrl: "https://inrecordmusic.com/unsubscribe?e=a%40x.com&t=abc" });
    expect(calls[0].body.headers).toEqual({ "List-Unsubscribe": "<https://inrecordmusic.com/unsubscribe?e=a%40x.com&t=abc>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
  });
  it("Brevo 402/429 → limitHit", async () => {
    vi.stubEnv("BREVO_API_KEY", "k"); vi.stubEnv("BREVO_SENDER_EMAIL", "s@x.com");
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 429, json: async () => ({}) }));
    const r = await sendNewsletterEmail({ to: "a@x.com", templateId: 3 });
    expect(r).toMatchObject({ success: false, limitHit: true, error: "brevo_429" });
  });
});
