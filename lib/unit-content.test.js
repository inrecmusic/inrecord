import { describe, it, expect } from "vitest";
import { buildContentItems, summarizeContent } from "./unit-content";

const V1 = "11111111-1111-1111-1111-111111111111";
const V2 = "22222222-2222-2222-2222-222222222222";

describe("buildContentItems", () => {
  it("沒有輸入時回空物件", () => {
    expect(buildContentItems()).toEqual({});
    expect(buildContentItems({})).toEqual({});
  });

  it("依 kind 分流講義與樂譜，並帶出 id 與標題", () => {
    const items = buildContentItems({
      materials: [
        { id: "m1", video_id: V1, kind: "handout", title: "和弦表速查" },
        { id: "m2", video_id: V1, kind: "score", title: "小星星（簡易版）" },
      ],
    });
    expect(items[V1]).toEqual([
      { kind: "handout", id: "m1", title: "和弦表速查" },
      { kind: "score", id: "m2", title: "小星星（簡易版）" },
    ]);
  });

  it("kind 為 null／未知值一律當講義（對應 DB 預設與舊資料）", () => {
    const items = buildContentItems({
      materials: [
        { id: "m1", video_id: V1, kind: null, title: "A" },
        { id: "m2", video_id: V2, kind: "weird", title: "B" },
      ],
    });
    expect(items[V1][0].kind).toBe("handout");
    expect(items[V2][0].kind).toBe("handout");
  });

  it("全課程通用講義（video_id 為 null）不產生任何單元項目", () => {
    expect(buildContentItems({ materials: [{ id: "m1", video_id: null, kind: "score", title: "通用" }] })).toEqual({});
  });

  it("games 產生 game 項目，video_id 為 null 者略過", () => {
    const items = buildContentItems({
      games: [{ id: "g1", video_id: V1, title: "音符找找看" }, { id: "g2", video_id: null, title: "略過" }],
    });
    expect(items[V1]).toEqual([{ kind: "game", id: "g1", title: "音符找找看" }]);
    expect(Object.keys(items)).toEqual([V1]);
  });

  it("assignment_desc 有實質內容才產生作業項，id 用 video_id", () => {
    const items = buildContentItems({
      videos: [
        { id: V1, assignment_desc: "彈完整首並錄影" },
        { id: V2, assignment_desc: "   " },
      ],
    });
    expect(items[V1]).toEqual([{ kind: "assignment", id: V1, title: "作業繳交" }]);
    expect(Object.keys(items)).toEqual([V1]);
  });

  it("同一單元多來源合併，且依 講義→樂譜→遊戲→作業 排序", () => {
    const items = buildContentItems({
      materials: [
        { id: "m2", video_id: V1, kind: "score", title: "樂譜" },
        { id: "m1", video_id: V1, kind: "handout", title: "講義" },
      ],
      games: [{ id: "g1", video_id: V1, title: "遊戲" }],
      videos: [{ id: V1, assignment_desc: "作業內容" }],
    });
    expect(items[V1].map((i) => i.kind)).toEqual(["handout", "score", "game", "assignment"]);
  });

  it("同類型內維持傳入順序", () => {
    const items = buildContentItems({
      materials: [
        { id: "m1", video_id: V1, kind: "handout", title: "第一份" },
        { id: "m2", video_id: V1, kind: "handout", title: "第二份" },
      ],
    });
    expect(items[V1].map((i) => i.title)).toEqual(["第一份", "第二份"]);
  });

  it("缺標題時回空字串而非 undefined", () => {
    const items = buildContentItems({ materials: [{ id: "m1", video_id: V1, kind: "handout" }] });
    expect(items[V1][0].title).toBe("");
  });

  it("容忍清單中的 null／缺欄位元素，不拋錯", () => {
    const items = buildContentItems({
      materials: [null, {}, { id: "m1", video_id: V1, kind: "score", title: "X" }],
      games: [null, {}],
      videos: [null, {}, { id: V1 }],
    });
    expect(items[V1]).toEqual([{ kind: "score", id: "m1", title: "X" }]);
  });
});

describe("summarizeContent", () => {
  it("沒有輸入時各項為 0", () => {
    expect(summarizeContent()).toEqual({ videos: 0, handout: 0, score: 0, game: 0, assignment: 0 });
  });

  it("跨單元加總各類型數量，videos 用傳入的影片總數", () => {
    const map = {
      [V1]: [
        { kind: "handout", id: "m1", title: "A" },
        { kind: "handout", id: "m2", title: "B" },
        { kind: "score", id: "m3", title: "C" },
        { kind: "assignment", id: V1, title: "作業繳交" },
      ],
      [V2]: [
        { kind: "score", id: "m4", title: "D" },
        { kind: "game", id: "g1", title: "E" },
      ],
    };
    expect(summarizeContent(map, 21)).toEqual({ videos: 21, handout: 2, score: 2, game: 1, assignment: 1 });
  });

  it("videoCount 缺省為 0，未知 kind 不計入", () => {
    const map = { [V1]: [{ kind: "mystery", id: "x", title: "?" }, { kind: "game", id: "g1", title: "G" }] };
    expect(summarizeContent(map)).toEqual({ videos: 0, handout: 0, score: 0, game: 1, assignment: 0 });
  });
});
