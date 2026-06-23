import { describe, it, expect } from "vitest";
import { sendNewsletterBatch, gatherAudienceEmails } from "./newsletter-send.js";

describe("sendNewsletterBatch", () => {
  const mails = (n) => Array.from({ length: n }, (_, i) => String.fromCharCode(97 + i) + "@x.com");

  it("全部成功", async () => {
    const sent = [];
    const r = await sendNewsletterBatch({ emails: mails(2), send: async (e) => { sent.push(e); return { success: true }; } });
    expect(r).toMatchObject({ total: 2, sent: 2, failed: 0, limitHit: false });
    expect(sent).toEqual(["a@x.com", "b@x.com"]);
  });

  it("部分失敗：計數並繼續", async () => {
    const r = await sendNewsletterBatch({
      emails: mails(3),
      send: async (e) => (e.startsWith("b") ? { success: false, error: "boom" } : { success: true }),
    });
    expect(r.sent).toBe(2);
    expect(r.failed).toBe(1);
    expect(r.limitHit).toBe(false);
    expect(r.errors.join()).toMatch(/boom/);
  });

  it("觸頂(limitHit) 立即停止、不寄剩餘", async () => {
    const attempted = [];
    const r = await sendNewsletterBatch({
      emails: mails(4),
      send: async (e) => { attempted.push(e); return attempted.length === 3 ? { limitHit: true } : { success: true }; },
    });
    expect(r.sent).toBe(2);
    expect(r.limitHit).toBe(true);
    expect(attempted).toHaveLength(3); // 第 4 封沒嘗試
    expect(r.total).toBe(4);
  });

  it("dailyLimit 自我上限：到達就停", async () => {
    const attempted = [];
    const r = await sendNewsletterBatch({
      emails: mails(3),
      dailyLimit: 2,
      send: async (e) => { attempted.push(e); return { success: true }; },
    });
    expect(r.sent).toBe(2);
    expect(r.limitHit).toBe(true);
    expect(attempted).toHaveLength(2);
  });
});

describe("gatherAudienceEmails", () => {
  function fakeSupabase({ enrollments = [], users = [] } = {}) {
    return {
      from(table) {
        return { select() { return Promise.resolve({ data: table === "enrollments" ? enrollments : [], error: null }); } };
      },
      auth: { admin: { listUsers({ page } = {}) { return Promise.resolve({ data: { users: page > 1 ? [] : users }, error: null }); } } },
    };
  }

  it("buyers → enrollments 的 email（去重正規化）", async () => {
    const sb = fakeSupabase({ enrollments: [{ email: "A@x.com" }, { email: "a@x.com" }, { email: "b@x.com" }] });
    expect(await gatherAudienceEmails(sb, "buyers")).toEqual(["a@x.com", "b@x.com"]);
  });

  it("registered → auth users 的 email（去重正規化）", async () => {
    const sb = fakeSupabase({ users: [{ email: "P@x.com" }, { email: "q@x.com" }, { email: "p@x.com" }] });
    expect(await gatherAudienceEmails(sb, "registered")).toEqual(["p@x.com", "q@x.com"]);
  });

  it("未知對象丟錯", async () => {
    await expect(gatherAudienceEmails(fakeSupabase(), "nope")).rejects.toThrow(/audience/);
  });
});
