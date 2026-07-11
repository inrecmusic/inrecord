import { describe, it, expect } from "vitest";
import { gradeQuiz, stripAnswers } from "./quiz.js";

const Q = [
  { id: "q1", question: "1?", options: ["a", "b"], correct_index: 0 },
  { id: "q2", question: "2?", options: ["a", "b", "c"], correct_index: 2 },
];

describe("gradeQuiz", () => {
  it("全對 → 100 分、通過", () => {
    expect(gradeQuiz(Q, [0, 2], 80)).toEqual({ score: 100, passed: true, correct: [0, 2] });
  });
  it("半對 → 50 分、未達 80 不通過", () => {
    expect(gradeQuiz(Q, [0, 0], 80)).toEqual({ score: 50, passed: false, correct: [0, 2] });
  });
  it("剛好達門檻即通過", () => {
    const four = [
      { correct_index: 0 }, { correct_index: 0 }, { correct_index: 0 }, { correct_index: 1 },
    ];
    // 3/4 = 75；門檻 75 → 通過
    expect(gradeQuiz(four, [0, 0, 0, 0], 75)).toEqual({ score: 75, passed: true, correct: [0, 0, 0, 1] });
  });
  it("未作答/答案過短視為答錯", () => {
    expect(gradeQuiz(Q, [0], 80)).toEqual({ score: 50, passed: false, correct: [0, 2] });
    expect(gradeQuiz(Q, [], 80)).toEqual({ score: 0, passed: false, correct: [0, 2] });
  });
  it("無題目 → 0 分不通過", () => {
    expect(gradeQuiz([], [], 80)).toEqual({ score: 0, passed: false, correct: [] });
    expect(gradeQuiz(null, null, 80)).toEqual({ score: 0, passed: false, correct: [] });
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
});
