import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { signUnsubscribeToken, verifyUnsubscribeToken, buildUnsubscribeUrl, recordUnsubscribe, excludeUnsubscribed, normalizeEmail } from "./unsubscribe.js";

beforeEach(() => vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-secret"));
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("簽章連結", () => {
  it("同一 email（不分大小寫／前後空白）簽章一致，驗證通過", () => {
    const t = signUnsubscribeToken("A@x.com");
    expect(verifyUnsubscribeToken(" a@x.com ", t)).toBe(true);
  });
  it("竄改 email 或 token 皆失敗；缺值失敗", () => {
    const t = signUnsubscribeToken("a@x.com");
    expect(verifyUnsubscribeToken("b@x.com", t)).toBe(false);
    expect(verifyUnsubscribeToken("a@x.com", t.slice(0, -2) + "00")).toBe(false);
    expect(verifyUnsubscribeToken("a@x.com", "")).toBe(false);
    expect(verifyUnsubscribeToken("", t)).toBe(false);
    expect(verifyUnsubscribeToken("a@x.com", "zz")).toBe(false);
  });
  it("buildUnsubscribeUrl 帶 encode 後的 email 與 token", () => {
    const url = buildUnsubscribeUrl("A+b@x.com", "https://inrecordmusic.com");
    const u = new URL(url);
    expect(u.pathname).toBe("/unsubscribe");
    expect(u.searchParams.get("e")).toBe("a+b@x.com");
    expect(verifyUnsubscribeToken(u.searchParams.get("e"), u.searchParams.get("t"))).toBe(true);
  });
});

describe("recordUnsubscribe / excludeUnsubscribed", () => {
  function fakeDb({ rows = [], failRead = false } = {}) {
    return {
      rows,
      from(table) {
        if (table !== "newsletter_unsubscribes") throw new Error("unexpected " + table);
        return {
          upsert: (row) => { if (!rows.some((r) => r.email === row.email)) rows.push(row); return Promise.resolve({ error: null }); },
          select: () => Promise.resolve(failRead ? { data: null, error: { message: "relation does not exist" } } : { data: rows, error: null }),
        };
      },
    };
  }
  it("寫入正規化 email，重複略過", async () => {
    const db = fakeDb();
    expect(await recordUnsubscribe(db, " A@x.com ", "link")).toBe("a@x.com");
    await recordUnsubscribe(db, "a@x.com", "one-click");
    expect(db.rows).toEqual([{ email: "a@x.com", source: "link" }]);
  });
  it("排除已退訂（不分大小寫）", async () => {
    const db = fakeDb({ rows: [{ email: "b@x.com" }] });
    expect(await excludeUnsubscribed(db, ["a@x.com", "B@x.com", "c@x.com"])).toEqual(["a@x.com", "c@x.com"]);
  });
  it("讀取失敗（表不存在）→ fail-open 照原名單", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const db = fakeDb({ failRead: true });
    expect(await excludeUnsubscribed(db, ["a@x.com"])).toEqual(["a@x.com"]);
  });
  it("normalizeEmail", () => expect(normalizeEmail("  X@Y.Z ")).toBe("x@y.z"));
});
