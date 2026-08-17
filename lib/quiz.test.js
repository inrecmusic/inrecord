import { describe, it, expect } from "vitest";
import { gradeQuiz, stripAnswers } from "./quiz.js";

const Q = [
  { id: "q1", question: "1?", options: ["a", "b"], correct_index: 0 },
  { id: "q2", question: "2?", options: ["a", "b", "c"], correct_index: 2 },
];

describe("gradeQuiz", () => {
  it("全對 → 100 分、通過、每題 results 皆 true", () => {
    expect(gradeQuiz(Q, [0, 2], 80)).toEqual({ score: 100, passed: true, results: [true, true] });
  });
  it("半對 → 50 分、未達 80 不通過、results 逐題對應對錯", () => {
    expect(gradeQuiz(Q, [0, 0], 80)).toEqual({ score: 50, passed: false, results: [true, false] });
  });
  it("剛好達門檻即通過", () => {
    const four = [
      { correct_index: 0 }, { correct_index: 0 }, { correct_index: 0 }, { correct_index: 1 },
    ];
    // 3/4 = 75；門檻 75 → 通過
    expect(gradeQuiz(four, [0, 0, 0, 0], 75)).toEqual({ score: 75, passed: true, results: [true, true, true, false] });
  });
  it("未作答/答案過短視為答錯", () => {
    expect(gradeQuiz(Q, [0], 80)).toEqual({ score: 50, passed: false, results: [true, false] });
    expect(gradeQuiz(Q, [], 80)).toEqual({ score: 0, passed: false, results: [false, false] });
  });
  it("無題目 → 0 分不通過", () => {
    expect(gradeQuiz([], [], 80)).toEqual({ score: 0, passed: false, results: [] });
    expect(gradeQuiz(null, null, 80)).toEqual({ score: 0, passed: false, results: [] });
  });
  it("題目缺 correct_index 且未作答 → 不給分（防 undefined===undefined）", () => {
    const bad = [{ question: "x", options: ["a", "b"] }]; // 無 correct_index
    expect(gradeQuiz(bad, [], 80)).toEqual({ score: 0, passed: false, results: [false] });
  });
  it("results 為對錯 boolean 陣列，長度等於題數", () => {
    const out = gradeQuiz(Q, [0, 0], 80);
    expect(out.results).toHaveLength(Q.length);
    out.results.forEach((r) => expect(typeof r).toBe("boolean"));
  });
  it("不洩漏正解：回傳值不含 correct/correct_index 欄位", () => {
    const out = gradeQuiz(Q, [0, 2], 80);
    expect(out.correct).toBeUndefined();
    expect(out.correct_index).toBeUndefined();
    expect(Object.keys(out).sort()).toEqual(["passed", "results", "score"]);
  });
});

describe("stripAnswers", () => {
  it("移除 correct_index、保留其餘", () => {
    const out = stripAnswers(Q);
    expect(out).toEqual([
      { id: "q1", question: "1?", options: ["a", "b"] },
      { id: "q2", question: "2?", options: ["a", "b", "c"] },
    ]);
    expect(out[0].correct_index).toBeUndefined();
  });
  it("非陣列 → 空陣列", () => {
    expect(stripAnswers(null)).toEqual([]);
    expect(stripAnswers(undefined)).toEqual([]);
  });
  it("陣列含非物件元素不拋錯", () => {
    expect(stripAnswers([null, { correct_index: 1, question: "q" }])).toEqual([null, { question: "q" }]);
  });
});
