import { describe, it, expect } from "vitest";
import { shouldPrompt, readPromptState, recordPrompt, localDay, MAX_TOTAL, MAX_PER_DAY } from "./rating-prompt";

const video = { id: "v1", title: "1-1 認識鍵盤" };
const fresh = { total: 0, day: "", dayCount: 0 };
const base = { rated: false, video, completed: true, state: fresh, today: "2026-10-11" };

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

describe("shouldPrompt（播完一個正課單元就邀請評分；總共最多 3 次、同一天最多 2 次）", () => {
  it("未評分、正課單元播完且已完成、沒跳過 → true", () => expect(shouldPrompt(base)).toBe(true));
  it("已評分 → false", () => expect(shouldPrompt({ ...base, rated: true })).toBe(false));
  it("單元還沒達到完成 → false", () => expect(shouldPrompt({ ...base, completed: false })).toBe(false));
  it("試看單元 → false", () => expect(shouldPrompt({ ...base, video: { id: "t", title: "試看 開場" } })).toBe(false));
  it("沒有單元資料 → false", () => expect(shouldPrompt({ ...base, video: null })).toBe(false));
  it("本裝置已跳滿 3 次 → false", () => {
    expect(MAX_TOTAL).toBe(3);
    expect(shouldPrompt({ ...base, state: { total: 3, day: "2026-10-01", dayCount: 1 } })).toBe(false);
  });
  it("今天已跳 2 次 → false；隔天又可以", () => {
    expect(MAX_PER_DAY).toBe(2);
    const state = { total: 2, day: "2026-10-11", dayCount: 2 };
    expect(shouldPrompt({ ...base, state })).toBe(false);
    expect(shouldPrompt({ ...base, state, today: "2026-10-12" })).toBe(true);
  });
  it("今天只跳過 1 次 → 還能再跳", () => {
    expect(shouldPrompt({ ...base, state: { total: 1, day: "2026-10-11", dayCount: 1 } })).toBe(true);
  });
});

describe("recordPrompt／readPromptState（次數記在本裝置）", () => {
  it("沒紀錄 → 全 0", () => expect(readPromptState(memoryStorage())).toEqual(fresh));
  it("同一天連記兩次 → total 2、dayCount 2", () => {
    const s = memoryStorage();
    recordPrompt(s, "2026-10-11");
    recordPrompt(s, "2026-10-11");
    expect(readPromptState(s)).toEqual({ total: 2, day: "2026-10-11", dayCount: 2 });
  });
  it("換日 → dayCount 重算、total 續加", () => {
    const s = memoryStorage();
    recordPrompt(s, "2026-10-11");
    recordPrompt(s, "2026-10-11");
    recordPrompt(s, "2026-10-12");
    expect(readPromptState(s)).toEqual({ total: 3, day: "2026-10-12", dayCount: 1 });
  });
  it("內容壞掉或 storage 丟例外 → 當作沒紀錄，不拋錯", () => {
    const bad = memoryStorage();
    bad.setItem("inrec_rating_prompt", "{not json");
    expect(readPromptState(bad)).toEqual(fresh);
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(readPromptState(throwing)).toEqual(fresh);
    expect(() => recordPrompt(throwing, "2026-10-11")).not.toThrow();
  });
});

describe("localDay（以裝置當地日期算「同一天」）", () => {
  it("回 YYYY-MM-DD，月日補零", () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});
