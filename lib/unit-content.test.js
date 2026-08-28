import { describe, it, expect } from "vitest";
import { buildContentFlags } from "./unit-content";

const V1 = "11111111-1111-1111-1111-111111111111";
const V2 = "22222222-2222-2222-2222-222222222222";

describe("buildContentFlags", () => {
  it("沒有輸入時回空物件", () => {
    expect(buildContentFlags()).toEqual({});
    expect(buildContentFlags({})).toEqual({});
  });

  it("依 kind 分流講義與樂譜", () => {
    const flags = buildContentFlags({
      materials: [
        { video_id: V1, kind: "handout" },
        { video_id: V2, kind: "score" },
      ],
    });
    expect(flags[V1]).toEqual({ handout: true, score: false, game: false, assignment: false });
    expect(flags[V2]).toEqual({ handout: false, score: true, game: false, assignment: false });
  });

  it("kind 為 null／未知值一律當講義（對應 DB 預設與舊資料）", () => {
    const flags = buildContentFlags({
      materials: [{ video_id: V1, kind: null }, { video_id: V2, kind: "weird" }],
    });
    expect(flags[V1].handout).toBe(true);
    expect(flags[V2].handout).toBe(true);
    expect(flags[V2].score).toBe(false);
  });

  it("全課程通用講義（video_id 為 null）不產生任何單元旗標", () => {
    expect(buildContentFlags({ materials: [{ video_id: null, kind: "score" }] })).toEqual({});
  });

  it("games 設定 game 旗標，video_id 為 null 者略過", () => {
    const flags = buildContentFlags({ games: [{ video_id: V1 }, { video_id: null }] });
    expect(flags[V1].game).toBe(true);
    expect(Object.keys(flags)).toEqual([V1]);
  });

  it("assignment_desc 有實質內容才算作業", () => {
    const flags = buildContentFlags({
      videos: [
        { id: V1, assignment_desc: "彈完整首並錄影" },
        { id: V2, assignment_desc: "   " },
        { id: "33333333-3333-3333-3333-333333333333", assignment_desc: null },
      ],
    });
    expect(flags[V1].assignment).toBe(true);
    expect(Object.keys(flags)).toEqual([V1]);
  });

  it("同一單元的多種來源會合併到同一筆", () => {
    const flags = buildContentFlags({
      materials: [{ video_id: V1, kind: "handout" }, { video_id: V1, kind: "score" }],
      games: [{ video_id: V1 }],
      videos: [{ id: V1, assignment_desc: "作業" }],
    });
    expect(flags[V1]).toEqual({ handout: true, score: true, game: true, assignment: true });
  });

  it("容忍清單中的 null／缺欄位元素，不拋錯", () => {
    const flags = buildContentFlags({
      materials: [null, {}, { video_id: V1, kind: "score" }],
      games: [null, {}],
      videos: [null, {}, { id: V1 }],
    });
    expect(flags[V1]).toEqual({ handout: false, score: true, game: false, assignment: false });
  });
});
