import { describe, it, expect } from "vitest";
import { shouldNudge, readNudgeDismissed, writeNudgeDismissed } from "./rating-nudge";

const chapters = [{ id: "c2", sort_order: 1 }, { id: "c1", sort_order: 0 }]; // 故意亂序
const videos = [
  { id: "t", chapter_id: "c1", title: "試看 開場" },
  { id: "v1", chapter_id: "c1", title: "1-1 認識鍵盤" },
  { id: "v2", chapter_id: "c1", title: "1-2 手型" },
  { id: "v3", chapter_id: "c2", title: "2-1 音名" },
];
const done = (...ids) => ids.map((video_id) => ({ video_id, completed: true }));
const base = { rated: false, chapters, videos, progress: done("v1", "v2"), dismissed: false };

describe("shouldNudge（看完第 1 章正課且未評分、未關閉才邀請）", () => {
  it("第 1 章正課全看完、未評分、未關閉 → true（試看單元不計、第 2 章不要求）", () => {
    expect(shouldNudge(base)).toBe(true);
  });
  it("已評分 → false", () => expect(shouldNudge({ ...base, rated: true })).toBe(false));
  it("本裝置關閉過 → false", () => expect(shouldNudge({ ...base, dismissed: true })).toBe(false));
  it("第 1 章還有正課沒看完 → false", () => expect(shouldNudge({ ...base, progress: done("v1") })).toBe(false));
  it("只看完試看單元 → false", () => expect(shouldNudge({ ...base, progress: done("t") })).toBe(false));
  it("第 1 章只有試看單元（沒有正課）→ false，不能把 0 支全看完當完成", () => {
    expect(shouldNudge({ ...base, videos: [videos[0], videos[3]], progress: done("t") })).toBe(false);
  });
  it("沒有章節／影片 → false", () => {
    expect(shouldNudge({ ...base, chapters: [], videos: [] })).toBe(false);
  });
  it("progress 的 completed 為 false 不算", () => {
    expect(shouldNudge({ ...base, progress: [{ video_id: "v1", completed: true }, { video_id: "v2", completed: false }] })).toBe(false);
  });
});

describe("dismissed 記在裝置", () => {
  const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
  it("預設 false；寫入後 true；storage 為 null 或丟例外一律 false／靜默", () => {
    const s = mem();
    expect(readNudgeDismissed(s)).toBe(false);
    writeNudgeDismissed(s);
    expect(readNudgeDismissed(s)).toBe(true);
    expect(readNudgeDismissed(null)).toBe(false);
    expect(() => writeNudgeDismissed({ setItem() { throw new Error("blocked"); } })).not.toThrow();
  });
});
