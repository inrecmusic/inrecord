import { describe, it, expect } from "vitest";
import { planRatingEdit, canEditScore, EDIT_WINDOW_MS } from "./rating-edit";

const T0 = Date.parse("2026-10-11T07:00:00Z");
const row = (over = {}) => ({ score: 4, content: null, created_at: "2026-10-11T07:00:00Z", ...over });
const within = T0 + 5 * 60 * 1000;
const after = T0 + EDIT_WINDOW_MS + 1000;

describe("planRatingEdit（學員修改自己評價的規則）", () => {
  it("修改視窗是 15 分鐘", () => expect(EDIT_WINDOW_MS).toBe(15 * 60 * 1000));

  it("心得空白 → 隨時可補寫（超過 15 分鐘也行），並撤下首頁精選", () => {
    expect(planRatingEdit(row(), { content: "  很有收穫  " }, after)).toEqual({ patch: { content: "很有收穫", featured: false } });
  });
  it("已有心得、超過 15 分鐘 → 不能再改", () => {
    expect(planRatingEdit(row({ content: "原本的" }), { content: "想改掉" }, after)).toEqual({ error: "edit_window_closed" });
  });
  it("已有心得、15 分鐘內 → 可改", () => {
    expect(planRatingEdit(row({ content: "原本的" }), { content: "改好的" }, within)).toEqual({ patch: { content: "改好的", featured: false } });
  });

  it("15 分鐘內改星數 → 可改，並撤下首頁精選", () => {
    expect(planRatingEdit(row(), { score: 5 }, within)).toEqual({ patch: { score: 5, featured: false } });
  });
  it("超過 15 分鐘改星數 → 不行", () => {
    expect(planRatingEdit(row(), { score: 5 }, after)).toEqual({ error: "edit_window_closed" });
  });
  it("星數沒變、只補心得 → 超過 15 分鐘仍可（不因帶了相同星數被擋）", () => {
    expect(planRatingEdit(row(), { score: 4, content: "補一句" }, after)).toEqual({ patch: { content: "補一句", featured: false } });
  });

  it("星數不是 1～5 的整數 → invalid_score", () => {
    for (const score of [0, 6, 4.5, "5", null]) expect(planRatingEdit(row(), { score }, within)).toEqual({ error: "invalid_score" });
  });
  it("心得超過 1000 字 → content_too_long", () => {
    expect(planRatingEdit(row(), { content: "字".repeat(1001) }, within)).toEqual({ error: "content_too_long" });
  });
  it("什麼都沒變 → patch 為 null（不動資料、不撤精選）", () => {
    expect(planRatingEdit(row(), {}, within)).toEqual({ patch: null });
    expect(planRatingEdit(row(), { score: 4, content: "   " }, within)).toEqual({ patch: null });
    expect(planRatingEdit(row({ content: "一樣" }), { content: "一樣" }, after)).toEqual({ patch: null });
  });
});

describe("canEditScore（前端用：星星還能不能點）", () => {
  it("15 分鐘內 true、之後 false、沒有建立時間當作 false", () => {
    expect(canEditScore(row(), within)).toBe(true);
    expect(canEditScore(row(), after)).toBe(false);
    expect(canEditScore({ score: 4 }, within)).toBe(false);
  });
});
