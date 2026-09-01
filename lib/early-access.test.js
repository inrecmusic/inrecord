import { describe, it, expect } from "vitest";
import { isEarlyAccess, stripPlayback, isTrialVideo, EARLY_CUTOFF_MS, FULL_RELEASE_MS } from "./early-access.js";

const BEFORE = "2026-09-05T12:00:00+08:00"; // cutoff 前
const AFTER  = "2026-09-10T00:00:01+08:00"; // cutoff 後

describe("isEarlyAccess", () => {
  it("9/9 含以前的付款訂單＝早鳥", () => {
    expect(isEarlyAccess({ orderTimes: [BEFORE] })).toBe(true);
    expect(isEarlyAccess({ orderTimes: ["2026-09-09T23:59:59+08:00"] })).toBe(true);
  });
  it("9/10 起才購課＝非早鳥", () => {
    expect(isEarlyAccess({ orderTimes: [AFTER] })).toBe(false);
  });
  it("多筆取最早：舊客加購新單仍是早鳥", () => {
    expect(isEarlyAccess({ orderTimes: [AFTER, BEFORE] })).toBe(true);
  });
  it("無訂單但開通紀錄在 cutoff 前（手動開通/演唱會名單）＝早鳥", () => {
    expect(isEarlyAccess({ orderTimes: [], enrollTimes: [BEFORE] })).toBe(true);
  });
  it("完全無紀錄＝保守非早鳥；壞值被過濾", () => {
    expect(isEarlyAccess({})).toBe(false);
    expect(isEarlyAccess({ orderTimes: ["not-a-date", null] })).toBe(false);
  });
  it("剛好 cutoff 那一刻＝早鳥（邊界含）", () => {
    expect(isEarlyAccess({ orderTimes: [EARLY_CUTOFF_MS] })).toBe(true);
    expect(isEarlyAccess({ orderTimes: [EARLY_CUTOFF_MS + 1] })).toBe(false);
  });
});

describe("stripPlayback", () => {
  const vids = [
    { id: "t", title: "試看：課程 Demo", bunny_video_id: "b0", vimeo_id: null },
    { id: "a", title: "1-1 認識鋼琴鍵盤", bunny_video_id: "b1", vimeo_id: null },
    { id: "b", title: "2-1 認識音名", bunny_video_id: null, vimeo_id: "v2" },
  ];
  const now = Date.parse("2026-09-15T12:00:00+08:00"); // release 前

  it("非早鳥、release 前：正課摘掉可播欄位、試看保留、其餘欄位不動", () => {
    const out = stripPlayback(vids, { early: false, nowMs: now });
    expect(out[0].bunny_video_id).toBe("b0");           // 試看不動
    expect(out[1].bunny_video_id).toBeNull();
    expect(out[2].vimeo_id).toBeNull();
    expect(out[1].title).toBe("1-1 認識鋼琴鍵盤");       // 標題照常（側欄大綱要顯示）
    expect(vids[1].bunny_video_id).toBe("b1");           // 不改原陣列
  });
  it("早鳥：原樣返回", () => {
    expect(stripPlayback(vids, { early: true, nowMs: now })).toBe(vids);
  });
  it("9/30 20:00 起：所有人原樣返回", () => {
    expect(stripPlayback(vids, { early: false, nowMs: FULL_RELEASE_MS })).toBe(vids);
  });
  it("cutoff 與 release 常數方向正確", () => {
    expect(EARLY_CUTOFF_MS).toBeLessThan(FULL_RELEASE_MS);
  });
  it("isTrialVideo 只認「試看」開頭", () => {
    expect(isTrialVideo({ title: "試看：課程 Demo" })).toBe(true);
    expect(isTrialVideo({ title: "1-1 試看不算" })).toBe(false);
    expect(isTrialVideo({})).toBe(false);
  });
});
