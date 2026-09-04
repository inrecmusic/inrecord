import { describe, it, expect } from "vitest";
import { sortAnnouncements, countUnread, pickImportant, pickStrip } from "./announcements-view.js";

const A = (id, { pinned = false, published = true, important = false, created_at = "2026-01-01T00:00:00Z" } = {}) =>
  ({ id, title: id, body: id, pinned, published, important, created_at });

describe("sortAnnouncements", () => {
  it("濾掉未發布", () => {
    const out = sortAnnouncements([A("a"), A("b", { published: false })]);
    expect(out.map(x => x.id)).toEqual(["a"]);
  });

  it("置頂在前，其餘依 created_at 新→舊", () => {
    const list = [
      A("old",    { created_at: "2026-01-01T00:00:00Z" }),
      A("new",    { created_at: "2026-03-01T00:00:00Z" }),
      A("pinned", { pinned: true, created_at: "2026-02-01T00:00:00Z" }),
    ];
    expect(sortAnnouncements(list).map(x => x.id)).toEqual(["pinned", "new", "old"]);
  });

  it("多則置頂之間也依時間新→舊", () => {
    const list = [
      A("p_old", { pinned: true, created_at: "2026-01-01T00:00:00Z" }),
      A("p_new", { pinned: true, created_at: "2026-05-01T00:00:00Z" }),
    ];
    expect(sortAnnouncements(list).map(x => x.id)).toEqual(["p_new", "p_old"]);
  });

  it("空或 nullish 輸入回空陣列", () => {
    expect(sortAnnouncements(null)).toEqual([]);
    expect(sortAnnouncements([])).toEqual([]);
  });
});

describe("countUnread", () => {
  const sorted = [A("a", { created_at: "2026-09-01T00:00:00Z" }), A("b", { created_at: "2026-09-04T00:00:00Z" })];

  it("沒看過（seenAt null）→ 全部未讀", () => {
    expect(countUnread(sorted, null)).toBe(2);
  });

  it("只算建立時間晚於 seenAt 的；Supabase 的 +00:00 與 toISOString 的 Z 混用也要算對", () => {
    expect(countUnread(sorted, "2026-09-02T00:00:00.000Z")).toBe(1);
    expect(countUnread([A("c", { created_at: "2026-09-04T09:30:00.123456+00:00" })], "2026-09-04T09:31:00.000Z")).toBe(0);
    expect(countUnread([A("c", { created_at: "2026-09-04T09:30:00.123456+00:00" })], "2026-09-04T09:29:00.000Z")).toBe(1);
  });

  it("空清單 → 0", () => {
    expect(countUnread([], null)).toBe(0);
    expect(countUnread(null, null)).toBe(0);
  });
});

describe("pickImportant", () => {
  it("回第一則 important 且尚未按「知道了」的", () => {
    const sorted = [A("x"), A("imp1", { important: true }), A("imp2", { important: true })];
    expect(pickImportant(sorted, []).id).toBe("imp1");
    expect(pickImportant(sorted, ["imp1"]).id).toBe("imp2");
    expect(pickImportant(sorted, ["imp1", "imp2"])).toBe(null);
  });

  it("沒有 important → null", () => {
    expect(pickImportant([A("x")], [])).toBe(null);
    expect(pickImportant([], null)).toBe(null);
  });
});

describe("pickStrip", () => {
  const sorted = [
    A("pinned_old", { pinned: true, created_at: "2026-08-01T00:00:00Z" }),
    A("newest",     { created_at: "2026-09-04T00:00:00Z" }),
    A("older",      { created_at: "2026-09-02T00:00:00Z" }),
  ];

  it("提示條放「最新的一則未讀」，不受置頂影響", () => {
    expect(pickStrip(sorted, null, null).id).toBe("newest");
  });

  it("已看過的不算；最新那則被關掉就不顯示", () => {
    expect(pickStrip(sorted, "2026-09-03T00:00:00Z", null).id).toBe("newest");
    expect(pickStrip(sorted, "2026-09-03T00:00:00Z", "newest")).toBe(null);
    expect(pickStrip(sorted, "2026-09-05T00:00:00Z", null)).toBe(null);
  });
});
