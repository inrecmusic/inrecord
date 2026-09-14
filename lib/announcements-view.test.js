import { describe, it, expect } from "vitest";
import { sortAnnouncements, countUnread, isUnread, legacyReadIds, pickImportant, pickStrip } from "./announcements-view.js";

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

describe("isUnread / countUnread（逐則已讀）", () => {
  const sorted = [A("a", { created_at: "2026-09-01T00:00:00Z" }), A("b", { created_at: "2026-09-04T00:00:00Z" })];

  it("已讀清單裡的才算已讀，其餘都未讀", () => {
    expect(countUnread(sorted, { read: [] })).toBe(2);
    expect(countUnread(sorted, { read: ["a"] })).toBe(1);
    expect(countUnread(sorted, { read: ["a", "b"] })).toBe(0);
    expect(isUnread(sorted[1], { read: ["a"] })).toBe(true);
    expect(isUnread(sorted[0], { read: ["a"] })).toBe(false);
  });

  it("已讀清單優先於舊的 seenAt（遷移後就不再看時間）", () => {
    const state = { read: ["b"], seenAt: "2026-09-05T00:00:00Z" };
    expect(countUnread(sorted, state)).toBe(1); // a 沒在清單裡→未讀，即使比 seenAt 早
  });

  it("read 為 null（尚未遷移）→ 退回舊規則：建立時間晚於 seenAt 才未讀", () => {
    expect(countUnread(sorted, { read: null, seenAt: null })).toBe(2);
    expect(countUnread(sorted, { read: null, seenAt: "2026-09-02T00:00:00.000Z" })).toBe(1);
    // Supabase 的 +00:00 與 toISOString 的 Z 混用也要算對
    const c = [A("c", { created_at: "2026-09-04T09:30:00.123456+00:00" })];
    expect(countUnread(c, { seenAt: "2026-09-04T09:31:00.000Z" })).toBe(0);
    expect(countUnread(c, { seenAt: "2026-09-04T09:29:00.000Z" })).toBe(1);
  });

  it("空清單／沒有狀態 → 0 與全未讀", () => {
    expect(countUnread([], { read: [] })).toBe(0);
    expect(countUnread(null, null)).toBe(0);
    expect(isUnread(A("x"), undefined)).toBe(true);
  });
});

describe("legacyReadIds（舊資料遷移）", () => {
  const sorted = [
    A("older",  { created_at: "2026-09-01T00:00:00Z" }),
    A("same",   { created_at: "2026-09-03T00:00:00Z" }),
    A("newer",  { created_at: "2026-09-04T00:00:00Z" }),
  ];

  it("created_at ≤ seenAt 的一次記成已讀（含等於），之後的維持未讀", () => {
    expect(legacyReadIds(sorted, "2026-09-03T00:00:00.000Z")).toEqual(["older", "same"]);
    expect(countUnread(sorted, { read: legacyReadIds(sorted, "2026-09-03T00:00:00.000Z") })).toBe(1);
  });

  it("沒有 seenAt（新裝置）→ 空清單，全部維持未讀", () => {
    expect(legacyReadIds(sorted, null)).toEqual([]);
    expect(countUnread(sorted, { read: [] })).toBe(3);
  });

  it("seenAt 晚於全部 → 全部已讀（老學員不會突然冒出一堆未讀）", () => {
    expect(legacyReadIds(sorted, "2026-09-09T00:00:00.000Z")).toEqual(["older", "same", "newer"]);
    expect(legacyReadIds(null, "2026-09-09T00:00:00.000Z")).toEqual([]);
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
  const TWO = [A("old", { created_at: "2026-01-01T00:00:00Z" }), A("new", { created_at: "2026-03-01T00:00:00Z" })];
  const sorted = sortAnnouncements(TWO);

  it("一律顯示最新一則（讀過也還在），未讀時帶 unread 旗標", () => {
    expect(pickStrip(sorted, { read: [] }, null)).toMatchObject({ id: "new", unread: true });
    expect(pickStrip(sorted, { read: ["new", "old"] }, null)).toMatchObject({ id: "new", unread: false });
  });

  it("該則被關掉就不顯示", () => {
    expect(pickStrip(sorted, { read: [] }, "new")).toBeNull();
  });

  it("沒有公告回 null", () => {
    expect(pickStrip([], { read: [] }, null)).toBeNull();
  });

  it("有置頂就常駐顯示最新那則置頂：關過也照樣出現、persistent=true；比它新的非置頂不搶位", () => {
    const list = sortAnnouncements([
      A("old-pin", { pinned: true, created_at: "2026-01-01T00:00:00Z" }),
      A("new-pin", { pinned: true, created_at: "2026-02-01T00:00:00Z" }),
      A("newest", { created_at: "2026-03-01T00:00:00Z" }),
    ]);
    expect(pickStrip(list, { read: [] }, null)).toMatchObject({ id: "new-pin", persistent: true, unread: true });
    expect(pickStrip(list, { read: ["new-pin"] }, "new-pin")).toMatchObject({ id: "new-pin", persistent: true, unread: false });
  });
});
