import { describe, it, expect } from "vitest";
import { certificateStatus } from "./certificate.js";

describe("certificateStatus", () => {
  it("影片全完成＋測驗全通過 → 合格", () => {
    expect(certificateStatus({
      publishedVideoIds: ["v1", "v2"], completedVideoIds: ["v1", "v2", "vx"],
      publishedQuizIds: ["q1"], passedQuizIds: ["q1"],
    })).toEqual({ eligible: true, videoDone: 2, videoTotal: 2, quizDone: 1, quizTotal: 1 });
  });

  it("缺一支影片 → 不合格，數字正確", () => {
    expect(certificateStatus({
      publishedVideoIds: ["v1", "v2"], completedVideoIds: ["v1"],
      publishedQuizIds: [], passedQuizIds: [],
    })).toEqual({ eligible: false, videoDone: 1, videoTotal: 2, quizDone: 0, quizTotal: 0 });
  });

  it("缺一份測驗 → 不合格", () => {
    expect(certificateStatus({
      publishedVideoIds: ["v1"], completedVideoIds: ["v1"],
      publishedQuizIds: ["q1", "q2"], passedQuizIds: ["q1"],
    })).toEqual({ eligible: false, videoDone: 1, videoTotal: 1, quizDone: 1, quizTotal: 2 });
  });

  it("無任何 published 測驗 → 測驗條件自動滿足", () => {
    expect(certificateStatus({
      publishedVideoIds: ["v1"], completedVideoIds: ["v1"],
      publishedQuizIds: [], passedQuizIds: [],
    })).toEqual({ eligible: true, videoDone: 1, videoTotal: 1, quizDone: 0, quizTotal: 0 });
  });

  it("無任何 published 影片 → 不合格（沒東西可完成）", () => {
    expect(certificateStatus({
      publishedVideoIds: [], completedVideoIds: [],
      publishedQuizIds: [], passedQuizIds: [],
    })).toEqual({ eligible: false, videoDone: 0, videoTotal: 0, quizDone: 0, quizTotal: 0 });
  });

  it("nullish 輸入 → 全 0、不合格", () => {
    expect(certificateStatus({})).toEqual({ eligible: false, videoDone: 0, videoTotal: 0, quizDone: 0, quizTotal: 0 });
  });
});
