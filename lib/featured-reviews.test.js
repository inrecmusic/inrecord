import { describe, it, expect, vi, afterEach } from "vitest";
import { toReviewCards, shouldShowMarquee, fillLoop, getFeaturedReviews, REVIEW_TEXT_MAX } from "./featured-reviews";
import { makeSupabaseMock } from "./test-helpers/supabase-mock";

afterEach(() => vi.unstubAllEnvs());

describe("toReviewCards", () => {
  it("轉成卡片：文字去空白、暱稱、台灣日期；不含 email", () => {
    const [c] = toReviewCards([{ id: "r1", score: 5, content: "  很有幫助！ ", user_name: " sam ", user_email: "a@b.com", created_at: "2026-10-05T15:30:00Z" }]);
    expect(c).toEqual({ id: "r1", score: 5, text: "很有幫助！", name: "sam", date: "2026/10/05" });
    expect(JSON.stringify(c)).not.toContain("a@b.com");
  });
  it("UTC 晚上跨日：台灣日期要是隔天", () => {
    const [c] = toReviewCards([{ id: "r1", score: 5, content: "x", user_name: "a", created_at: "2026-10-05T17:00:00Z" }]);
    expect(c.date).toBe("2026/10/06");
  });
  it("空白／換行的文字 → null；暱稱空白 → 學員", () => {
    const [c] = toReviewCards([{ id: "r1", score: 4, content: " \n ", user_name: "   ", created_at: "2026-10-05T00:00:00Z" }]);
    expect(c.text).toBeNull();
    expect(c.name).toBe("學員");
  });
  it("content／user_name 為 null 也不會炸", () => {
    const [c] = toReviewCards([{ id: "r1", score: 5, content: null, user_name: null, created_at: "2026-10-05T00:00:00Z" }]);
    expect(c).toMatchObject({ text: null, name: "學員" });
  });
  it("超過 120 字截斷加「…」；剛好 120 字不截", () => {
    const long = "あ".repeat(REVIEW_TEXT_MAX + 1);
    const exact = "あ".repeat(REVIEW_TEXT_MAX);
    const [a, b] = toReviewCards([
      { id: "1", score: 5, content: long, user_name: "a", created_at: "2026-10-05T00:00:00Z" },
      { id: "2", score: 5, content: exact, user_name: "a", created_at: "2026-10-05T00:00:00Z" },
    ]);
    expect(a.text).toBe("あ".repeat(REVIEW_TEXT_MAX) + "…");
    expect(b.text).toBe(exact);
  });
  it("score 轉數字；非數字落 0", () => {
    const [c, d] = toReviewCards([
      { id: "1", score: "5", content: "x", user_name: "a", created_at: "2026-10-05T00:00:00Z" },
      { id: "2", score: "abc", content: "x", user_name: "a", created_at: "2026-10-05T00:00:00Z" },
    ]);
    expect(c.score).toBe(5);
    expect(d.score).toBe(0);
  });
});

describe("shouldShowMarquee", () => {
  it("2 則不顯示、3 則顯示", () => {
    const card = (i) => ({ id: String(i), score: 5, text: null, name: "學員", date: "2026/10/05" });
    expect(shouldShowMarquee([card(1), card(2)])).toBe(false);
    expect(shouldShowMarquee([card(1), card(2), card(3)])).toBe(true);
  });
});

describe("fillLoop", () => {
  const cards = [1, 2, 3, 4].map((i) => ({ id: String(i) }));
  it("4 張補成 8 張、順序循環", () => {
    expect(fillLoop(cards).map((c) => c.id)).toEqual(["1", "2", "3", "4", "1", "2", "3", "4"]);
  });
  it("5 張補成 10 張（整輪重複，不切半）", () => {
    const five = [...cards, { id: "5" }];
    expect(fillLoop(five)).toHaveLength(10);
  });
  it("已滿 8 張不補；0 張回空", () => {
    const eight = Array.from({ length: 8 }, (_, i) => ({ id: String(i) }));
    expect(fillLoop(eight)).toHaveLength(8);
    expect(fillLoop([])).toEqual([]);
  });
});

describe("getFeaturedReviews", () => {
  const row = (over = {}) => ({ id: "r1", score: 5, content: "好", user_name: "sam", user_email: "s@x.com", created_at: "2026-10-05T00:00:00Z", ...over });
  it("查 featured=true、hidden=false、created_at desc、limit；回卡片", async () => {
    const sb = makeSupabaseMock(() => ({ data: [row()], error: null }));
    const cards = await getFeaturedReviews(sb, { adminEmail: "admin@x.com", limit: 5 });
    expect(cards).toEqual([{ id: "r1", score: 5, text: "好", name: "sam", date: "2026/10/05" }]);
    const q = sb.calls[0];
    expect(q.table).toBe("ratings");
    expect(q.ops).toContainEqual({ m: "eq", args: ["featured", true] });
    expect(q.ops).toContainEqual({ m: "eq", args: ["hidden", false] });
    expect(q.ops).toContainEqual({ m: "order", args: ["created_at", { ascending: false }] });
    expect(q.ops).toContainEqual({ m: "limit", args: [5] });
  });
  it("排除管理員自評（大小寫／空白不敏感）；adminEmail 預設讀 ADMIN_EMAIL", async () => {
    vi.stubEnv("ADMIN_EMAIL", "inrecmusic@gmail.com");
    const sb = makeSupabaseMock(() => ({ data: [row({ id: "a", user_email: " INRECMUSIC@gmail.com " }), row({ id: "b" })], error: null }));
    const cards = await getFeaturedReviews(sb);
    expect(cards.map((c) => c.id)).toEqual(["b"]);
  });
  it("查詢錯誤（例如欄位不存在）→ 回 []", async () => {
    const sb = makeSupabaseMock(() => ({ data: null, error: { message: "column featured does not exist" } }));
    expect(await getFeaturedReviews(sb)).toEqual([]);
  });
  it("db 為 null → 回 []", async () => {
    expect(await getFeaturedReviews(null)).toEqual([]);
  });
});
