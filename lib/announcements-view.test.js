import { describe, it, expect } from "vitest";
import { sortAnnouncements, pickBanner } from "./announcements-view.js";

const A = (id, { pinned = false, published = true, created_at = "2026-01-01T00:00:00Z" } = {}) =>
  ({ id, title: id, body: id, pinned, published, created_at });

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

describe("pickBanner", () => {
  it("回排序後第一則", () => {
    const sorted = [A("top"), A("second")];
    expect(pickBanner(sorted, null)?.id).toBe("top");
  });

  it("第一則已被關閉 → 回 null", () => {
    const sorted = [A("top"), A("second")];
    expect(pickBanner(sorted, "top")).toBe(null);
  });

  it("空清單 → 回 null", () => {
    expect(pickBanner([], null)).toBe(null);
    expect(pickBanner(null, "x")).toBe(null);
  });
});
