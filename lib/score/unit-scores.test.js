import { describe, it, expect } from "vitest";
import { mergeUnitScores, isMissingRelation, sidebarScores } from "./unit-scores.js";

const ABC = { id: "a1", video_id: "v1", title: "小蜜蜂", subtitle: "右手旋律", abc: "X:1", sort_order: 0 };
const V2 = (id, title, sort_order = 0) => ({ id, title, subtitle: null, format: "musicxml", musicxml: "<x/>", version: 2, sort_order });

describe("mergeUnitScores", () => {
  it("舊 ABC 與 v2 合併、標 format", () => {
    const out = mergeUnitScores([ABC], [V2("s1", "小蜜蜂雙手", 1)]);
    expect(out.map((s) => [s.id, s.format])).toEqual([["a1", "abc"], ["s1", "musicxml"]]);
    expect(out[0].abc).toBe("X:1");
    expect(out[1]).toMatchObject({ musicxml: "<x/>", version: 2 });
  });
  it("依 id 去重、依 sort_order 再曲名排序", () => {
    const out = mergeUnitScores([], [V2("s2", "B 曲", 1), V2("s1", "A 曲", 1), V2("s3", "C 曲", 0), V2("s1", "A 曲", 1)]);
    expect(out.map((s) => s.id)).toEqual(["s3", "s1", "s2"]);
  });
  it("壞資料不丟例外", () => expect(mergeUnitScores(null, undefined)).toEqual([]));
});

describe("isMissingRelation", () => {
  it.each([
    [{ code: "42703", message: "column scores.format does not exist" }],
    [{ code: "42P01", message: 'relation "score_units" does not exist' }],
    [{ code: "PGRST200", message: "Could not find a relationship between 'score_units' and 'scores' in the schema cache" }],
    [{ message: "Could not find the table 'public.score_units' in the schema cache" }],
  ])("%o → true", (e) => expect(isMissingRelation(e)).toBe(true));
  it("其他錯誤 → false", () => {
    expect(isMissingRelation({ code: "57014", message: "canceling statement due to statement timeout" })).toBe(false);
    expect(isMissingRelation(null)).toBe(false);
  });
});

describe("sidebarScores", () => {
  it("合併成 { id, video_id, title }，v2 掛幾個單元就出現幾次", () => {
    const out = sidebarScores(
      { data: [{ id: "a1", video_id: "v1", title: "小蜜蜂" }], error: null },
      { data: [{ video_id: "v1", scores: { id: "s1", title: "雙手" } }, { video_id: "v2", scores: { id: "s1", title: "雙手" } }], error: null },
    );
    expect(out).toEqual([
      { id: "a1", video_id: "v1", title: "小蜜蜂" },
      { id: "s1", video_id: "v1", title: "雙手" },
      { id: "s1", video_id: "v2", title: "雙手" },
    ]);
  });
  it("v2 查詢失敗（表還沒建）仍回舊 ABC", () => {
    const out = sidebarScores({ data: [{ id: "a1", video_id: "v1", title: "小蜜蜂" }], error: null }, { data: null, error: { code: "42P01", message: "x" } });
    expect(out).toEqual([{ id: "a1", video_id: "v1", title: "小蜜蜂" }]);
  });
});
