import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { normalizeScoreInput } from "./admin-input.js";

const fx = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const BEE = fx("twinkle-grand.musicxml");
const U1 = "11111111-1111-4111-8111-111111111111";

describe("normalizeScoreInput", () => {
  it("新建缺曲名或缺檔 → 錯誤", () => {
    expect(normalizeScoreInput({ musicxml: BEE }, { partial: false }).errors).toContain("missing_title");
    expect(normalizeScoreInput({ title: "x" }, { partial: false }).errors).toContain("missing_musicxml");
    expect(normalizeScoreInput({ title: "  " }, { partial: true }).errors).toContain("missing_title");
  });

  it("難度只收 1–3", () => {
    expect(normalizeScoreInput({ difficulty: 5 }, { partial: true }).errors).toContain("bad_difficulty");
    expect(normalizeScoreInput({ difficulty: 2 }, { partial: true }).fields.difficulty).toBe(2);
    expect(normalizeScoreInput({ difficulty: null }, { partial: true }).fields.difficulty).toBe(null);
  });

  it("不是兩行譜 → 錯誤碼", () => {
    const r = normalizeScoreInput({ title: "x", musicxml: fx("single-staff.musicxml") }, { partial: false });
    expect(r.errors).toContain("not_grand_staff");
  });

  it("小蜜蜂 → 中繼資料", () => {
    const r = normalizeScoreInput({ title: " 小蜜蜂 ", musicxml: BEE, file_name: "1-2_小蜜蜂_v1.mxl" }, { partial: false });
    expect(r.errors).toEqual([]);
    expect(r.fields.title).toBe("小蜜蜂");
    expect(r.fields.meta).toMatchObject({ measureCount: 8, hasChords: true, tempo: 96, time: { beats: 4, beatType: 4 } });
    expect(r.fields.meta.key.fifths).toBe(0);
    expect(r.fields.meta.warnings).toEqual([]);
  });

  it("白名單外欄位丟掉", () => {
    const r = normalizeScoreInput({ title: "x", format: "abc", abc: "X:1", version: 9, id: "z" }, { partial: true });
    expect(Object.keys(r.fields)).toEqual(["title"]);
  });

  it("unitIds 只收 uuid 陣列；沒給就是 undefined", () => {
    expect(normalizeScoreInput({ unitIds: [U1] }, { partial: true }).unitIds).toEqual([U1]);
    expect(normalizeScoreInput({}, { partial: true }).unitIds).toBe(undefined);
    expect(normalizeScoreInput({ unitIds: ["x"] }, { partial: true }).errors).toContain("bad_unit_ids");
  });

  it("published 必須是布林", () => {
    expect(normalizeScoreInput({ published: "yes" }, { partial: true }).errors).toContain("bad_published");
    expect(normalizeScoreInput({ published: true }, { partial: true }).fields.published).toBe(true);
  });
});
