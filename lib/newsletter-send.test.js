import { describe, it, expect } from "vitest";
import {
  sendNewsletterBatch, gatherAudienceEmails,
  contentHash, filterUnsent, countSentToday, recordSent,
} from "./newsletter-send.js";

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

  it("每封成功後呼叫 onSent（用於落地寄送記錄），失敗不呼叫", async () => {
    const recorded = [];
    const r = await sendNewsletterBatch({
      emails: mails(3),
      send: async (e) => (e.startsWith("b") ? { success: false, error: "x" } : { success: true }),
      onSent: async (e) => recorded.push(e),
    });
    expect(r.sent).toBe(2);
    expect(recorded).toEqual(["a@x.com", "c@x.com"]); // 只記成功的
  });
});

describe("contentHash", () => {
  it("相同 subject+body 得相同 hash；內容變更則不同", () => {
    const a = contentHash("主旨", "內文");
    expect(a).toBe(contentHash("主旨", "內文"));
    expect(a).not.toBe(contentHash("主旨", "內文改"));
    expect(a).not.toBe(contentHash("主旨改", "內文"));
    expect(typeof a).toBe("string");
  });
});

describe("filterUnsent", () => {
  const fake = (rows) => ({
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: rows, error: null }) }) }),
  });
  it("濾掉這封內容已寄過的 email（重跑不重寄）", async () => {
    const out = await filterUnsent(fake([{ email: "a@x.com" }]), "h1", ["a@x.com", "b@x.com", "c@x.com"]);
    expect(out).toEqual(["b@x.com", "c@x.com"]);
  });
  it("空名單回空、不查詢", async () => {
    expect(await filterUnsent(fake([]), "h1", [])).toEqual([]);
  });
});

describe("countSentToday", () => {
  const fake = (count) => {
    const seen = {};
    return {
      _seen: seen,
      from: () => ({ select: () => ({ gte: (col, val) => { seen.col = col; seen.val = val; return Promise.resolve({ count, error: null }); } }) }),
    };
  };
  it("回今日已寄筆數，以 UTC 當日 00:00 為起點", async () => {
    const f = fake(42);
    expect(await countSentToday(f, new Date("2026-06-26T15:30:00Z"))).toBe(42);
    expect(f._seen.col).toBe("sent_at");
    expect(f._seen.val).toBe("2026-06-26T00:00:00.000Z");
  });
});

describe("recordSent", () => {
  it("插入寄送記錄；容忍 23505（重複鍵）不丟錯", async () => {
    const calls = [];
    const ok = { from: () => ({ insert: (row) => { calls.push(row); return Promise.resolve({ error: null }); } }) };
    await recordSent(ok, "h1", "a@x.com");
    expect(calls[0]).toEqual({ content_hash: "h1", email: "a@x.com" });

    const dup = { from: () => ({ insert: () => Promise.resolve({ error: { code: "23505" } }) }) };
    await expect(recordSent(dup, "h1", "a@x.com")).resolves.toBeUndefined();
  });
  it("非 23505 錯誤要丟出", async () => {
    const bad = { from: () => ({ insert: () => Promise.resolve({ error: { code: "XX", message: "boom" } }) }) };
    await expect(recordSent(bad, "h1", "a@x.com")).rejects.toThrow(/boom/);
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
