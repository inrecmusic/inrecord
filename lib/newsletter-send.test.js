import { describe, it, expect } from "vitest";
import {
  sendNewsletterBatch, gatherAudienceEmails,
  contentHash, filterUnsent, countSentToday, claimSend, releaseSend,
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

  it("送前先 claim 佔位；claim 搶不到就跳過不寄（skipped），不呼叫 send", async () => {
    const attempted = [];
    const r = await sendNewsletterBatch({
      emails: mails(3),
      claim: async (e) => !e.startsWith("b"), // b 被別的請求佔走
      send: async (e) => { attempted.push(e); return { success: true }; },
    });
    expect(attempted).toEqual(["a@x.com", "c@x.com"]); // b 沒被寄
    expect(r.sent).toBe(2);
    expect(r.skipped).toBe(1);
  });

  it("送失敗 / 觸頂會 release 退回佔位（成功不 release）", async () => {
    const released = [];
    const r = await sendNewsletterBatch({
      emails: mails(3),
      claim: async () => true,
      release: async (e) => released.push(e),
      send: async (e) => (e.startsWith("b") ? { success: false, error: "x" } : { success: true }),
    });
    expect(r.sent).toBe(2);
    expect(r.failed).toBe(1);
    expect(released).toEqual(["b@x.com"]); // 只退回失敗那封
  });

  it("觸頂(limitHit) 那封也 release，避免佔位卻沒寄", async () => {
    const released = [];
    const r = await sendNewsletterBatch({
      emails: mails(3),
      claim: async () => true,
      release: async (e) => released.push(e),
      send: async (e) => (e.startsWith("b") ? { limitHit: true } : { success: true }),
    });
    expect(r.sent).toBe(1);          // 只有 a 寄出
    expect(r.limitHit).toBe(true);
    expect(released).toEqual(["b@x.com"]); // b 觸頂未寄 → 退回
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

describe("claimSend", () => {
  it("insert 成功＝搶到（回 true），帶正確欄位", async () => {
    const calls = [];
    const ok = { from: () => ({ insert: (row) => { calls.push(row); return Promise.resolve({ error: null }); } }) };
    expect(await claimSend(ok, "h1", "a@x.com")).toBe(true);
    expect(calls[0]).toEqual({ content_hash: "h1", email: "a@x.com" });
  });
  it("撞唯一鍵 23505＝別人已佔（回 false，不丟錯）", async () => {
    const dup = { from: () => ({ insert: () => Promise.resolve({ error: { code: "23505" } }) }) };
    expect(await claimSend(dup, "h1", "a@x.com")).toBe(false);
  });
  it("非 23505 錯誤要丟出", async () => {
    const bad = { from: () => ({ insert: () => Promise.resolve({ error: { code: "XX", message: "boom" } }) }) };
    await expect(claimSend(bad, "h1", "a@x.com")).rejects.toThrow(/boom/);
  });
});

describe("releaseSend", () => {
  it("依 content_hash + email 刪除佔位", async () => {
    const seen = {};
    const sb = { from: () => ({ delete: () => ({ eq: (c1, v1) => ({ eq: (c2, v2) => { seen[c1] = v1; seen[c2] = v2; return Promise.resolve({ error: null }); } }) }) }) };
    await releaseSend(sb, "h1", "a@x.com");
    expect(seen).toEqual({ content_hash: "h1", email: "a@x.com" });
  });
  it("刪除出錯要丟出", async () => {
    const bad = { from: () => ({ delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: { message: "boom" } }) }) }) }) };
    await expect(releaseSend(bad, "h1", "a@x.com")).rejects.toThrow(/boom/);
  });
});

describe("gatherAudienceEmails", () => {
  function fakeSupabase({ enrollments = [], users = [], unsubscribes = [] } = {}) {
    return {
      from(table) {
        const data = table === "enrollments" ? enrollments : table === "newsletter_unsubscribes" ? unsubscribes : [];
        return { select() { return Promise.resolve({ data, error: null }); } };
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

  it("兩種對象都排除 newsletter_unsubscribes 內的 email", async () => {
    const sb = fakeSupabase({ enrollments: [{ email: "a@x.com" }, { email: "b@x.com" }], users: [{ email: "p@x.com" }, { email: "B@x.com" }], unsubscribes: [{ email: "B@x.com" }] });
    expect(await gatherAudienceEmails(sb, "buyers")).toEqual(["a@x.com"]);
    expect(await gatherAudienceEmails(sb, "registered")).toEqual(["p@x.com"]);
  });

  it("未知對象丟錯", async () => {
    await expect(gatherAudienceEmails(fakeSupabase(), "nope")).rejects.toThrow(/audience/);
  });
});
