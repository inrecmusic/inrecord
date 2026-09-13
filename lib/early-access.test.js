import { describe, it, expect } from "vitest";
import {
  isEarlyAccess, stripPlayback, isTrialVideo, canPlayVideo, chapterSortMap,
  EARLY_CUTOFF_MS, FULL_RELEASE_MS, SECOND_RELEASE_MS, FIRST_BATCH_MAX_SORT,
} from "./early-access.js";

const BEFORE = "2026-08-30T12:00:00+08:00"; // cutoff 前（音樂會預購期間）
const AFTER  = "2026-09-02T00:00:01+08:00"; // cutoff 後（9/2 開課日起購課）

describe("isEarlyAccess", () => {
  it("9/2 之前（音樂會預購）的付款訂單＝早鳥", () => {
    expect(isEarlyAccess({ orderTimes: [BEFORE] })).toBe(true);
    expect(isEarlyAccess({ orderTimes: ["2026-09-01T23:59:59+08:00"] })).toBe(true);
  });
  it("9/2 起才購課＝非早鳥（含原本 9/9 前的日期）", () => {
    expect(isEarlyAccess({ orderTimes: [AFTER] })).toBe(false);
    expect(isEarlyAccess({ orderTimes: ["2026-09-05T12:00:00+08:00"] })).toBe(false);
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

// ── 分批上架（9/30 第一批 Ch1～Ch3、10/31 完整上架）──────────────────────────
// ⚠️ chapters.sort_order 是 0-based：0=Ch1、1=Ch2、2=Ch3、3=Ch4…、10/11=附錄。
const CH1 = 0, CH2 = 1, CH3 = 2, CH4 = 3, CH10 = 9, APPENDIX1 = 10, APPENDIX2 = 11;
const BEFORE_FIRST = Date.parse("2026-09-15T12:00:00+08:00"); // 9/30 前
const BETWEEN      = Date.parse("2026-10-15T12:00:00+08:00"); // 9/30–10/31 之間
const AFTER_SECOND = Date.parse("2026-11-05T12:00:00+08:00"); // 10/31 後
const LESSON = { id: "x", title: "4-1 節奏與拍子" };
const TRIAL  = { id: "t", title: "試看：課程 Demo" };
const play = (over) => canPlayVideo({ video: LESSON, early: false, ...over });

describe("canPlayVideo（可播判斷：三段時間 × 早鳥 × 試看）", () => {
  it("常數方向正確：cutoff < 第一批 < 第二批", () => {
    expect(EARLY_CUTOFF_MS).toBeLessThan(FULL_RELEASE_MS);
    expect(FULL_RELEASE_MS).toBeLessThan(SECOND_RELEASE_MS);
    expect(FIRST_BATCH_MAX_SORT).toBe(2); // 0-based：Ch1/Ch2/Ch3
  });

  it("早鳥：三段時間都可播，含 Ch10、附錄與沒有章節的影片", () => {
    for (const nowMs of [BEFORE_FIRST, FULL_RELEASE_MS, BETWEEN, SECOND_RELEASE_MS, AFTER_SECOND]) {
      for (const chapterSort of [CH1, CH4, CH10, APPENDIX1, APPENDIX2, undefined]) {
        expect(canPlayVideo({ video: LESSON, early: true, nowMs, chapterSort })).toBe(true);
      }
    }
  });

  it("試看單元：任何時間、任何身分、任何章節都可播", () => {
    for (const nowMs of [BEFORE_FIRST, BETWEEN, AFTER_SECOND]) {
      for (const early of [true, false]) {
        expect(canPlayVideo({ video: TRIAL, early, nowMs, chapterSort: APPENDIX2 })).toBe(true);
        expect(canPlayVideo({ video: TRIAL, early, nowMs, chapterSort: undefined })).toBe(true);
      }
    }
  });

  it("非早鳥、9/30 前：連第一批 Ch1 都擋", () => {
    expect(play({ nowMs: BEFORE_FIRST, chapterSort: CH1 })).toBe(false);
    expect(play({ nowMs: BEFORE_FIRST, chapterSort: CH4 })).toBe(false);
  });

  it("非早鳥、9/30–10/31：只有 sort_order 0/1/2（Ch1～Ch3）可播", () => {
    expect(play({ nowMs: BETWEEN, chapterSort: CH1 })).toBe(true);
    expect(play({ nowMs: BETWEEN, chapterSort: CH2 })).toBe(true);
    expect(play({ nowMs: BETWEEN, chapterSort: CH3 })).toBe(true);
    expect(play({ nowMs: BETWEEN, chapterSort: CH4 })).toBe(false); // 最容易犯的 off-by-one
    expect(play({ nowMs: BETWEEN, chapterSort: CH10 })).toBe(false);
  });

  it("非早鳥、9/30–10/31：附錄不屬於第一批，擋下", () => {
    expect(play({ nowMs: BETWEEN, chapterSort: APPENDIX1 })).toBe(false);
    expect(play({ nowMs: BETWEEN, chapterSort: APPENDIX2 })).toBe(false);
  });

  it("非早鳥、10/31 後：全部章節開放（含附錄）", () => {
    for (const chapterSort of [CH1, CH4, CH10, APPENDIX2, undefined]) {
      expect(play({ nowMs: AFTER_SECOND, chapterSort })).toBe(true);
    }
  });

  it("章節查不到（chapter_id 為 null／查詢失敗）：非早鳥在 9/30–10/31 被擋、早鳥照播", () => {
    expect(play({ nowMs: BETWEEN, chapterSort: undefined })).toBe(false);
    expect(play({ nowMs: BETWEEN, chapterSort: null })).toBe(false);
    expect(play({ nowMs: BETWEEN, chapterSort: NaN })).toBe(false);
    expect(canPlayVideo({ video: LESSON, early: true, nowMs: BETWEEN, chapterSort: undefined })).toBe(true);
  });

  it("邊界：正好 9/30 20:00:00 起第一批開、正好 10/31 20:00:00 起全開", () => {
    expect(play({ nowMs: FULL_RELEASE_MS - 1, chapterSort: CH1 })).toBe(false);
    expect(play({ nowMs: FULL_RELEASE_MS, chapterSort: CH1 })).toBe(true);
    expect(play({ nowMs: FULL_RELEASE_MS, chapterSort: CH4 })).toBe(false);
    expect(play({ nowMs: SECOND_RELEASE_MS - 1, chapterSort: CH4 })).toBe(false);
    expect(play({ nowMs: SECOND_RELEASE_MS, chapterSort: CH4 })).toBe(true);
    expect(play({ nowMs: SECOND_RELEASE_MS, chapterSort: APPENDIX2 })).toBe(true);
  });

  it("batched=false（不帶章節資訊的舊呼叫端）：9/30 起全開，維持改版前行為", () => {
    expect(play({ nowMs: BEFORE_FIRST, chapterSort: CH1, batched: false })).toBe(false);
    expect(play({ nowMs: BETWEEN, chapterSort: CH4, batched: false })).toBe(true);
    expect(play({ nowMs: BETWEEN, chapterSort: undefined, batched: false })).toBe(true);
  });
});

describe("stripPlayback 分批（帶 chapterSortById）", () => {
  const chapters = [
    { id: "c1", title: "Ch1", sort_order: CH1 },
    { id: "c3", title: "Ch3", sort_order: CH3 },
    { id: "c4", title: "Ch4", sort_order: CH4 },
    { id: "cA", title: "附錄1", sort_order: APPENDIX1 },
  ];
  const map = chapterSortMap(chapters);
  const batch = [
    { id: "t",  chapter_id: "c1", title: "試看：課程 Demo", bunny_video_id: "b0", vimeo_id: null },
    { id: "a",  chapter_id: "c1", title: "1-1 認識鋼琴鍵盤", bunny_video_id: "b1", vimeo_id: null },
    { id: "c",  chapter_id: "c3", title: "3-1 看懂樂譜",     bunny_video_id: "b3", vimeo_id: null },
    { id: "d",  chapter_id: "c4", title: "4-1 節奏與拍子",   bunny_video_id: null, vimeo_id: "v4" },
    { id: "x",  chapter_id: "cA", title: "附錄 練琴方法",     bunny_video_id: "bA", vimeo_id: null },
    { id: "n",  chapter_id: null, title: "未分章單元",        bunny_video_id: "bN", vimeo_id: null },
  ];
  const srcOf = (out) => out.map((v) => v.bunny_video_id || v.vimeo_id);

  it("非早鳥、9/30–10/31：Ch1～Ch3 與試看留著，Ch4／附錄／無章節被摘掉", () => {
    const out = stripPlayback(batch, { early: false, nowMs: BETWEEN, chapterSortById: map });
    expect(srcOf(out)).toEqual(["b0", "b1", "b3", null, null, null]);
    expect(batch[3].vimeo_id).toBe("v4"); // 不改原陣列
  });
  it("非早鳥、9/30 前：全部正課摘掉、只留試看", () => {
    const out = stripPlayback(batch, { early: false, nowMs: BEFORE_FIRST, chapterSortById: map });
    expect(srcOf(out)).toEqual(["b0", null, null, null, null, null]);
  });
  it("非早鳥、10/31 起：原樣返回", () => {
    expect(stripPlayback(batch, { early: false, nowMs: SECOND_RELEASE_MS, chapterSortById: map })).toBe(batch);
    expect(stripPlayback(batch, { early: false, nowMs: SECOND_RELEASE_MS - 1, chapterSortById: map })).not.toBe(batch);
  });
  it("早鳥：任何時間原樣返回", () => {
    for (const nowMs of [BEFORE_FIRST, BETWEEN, AFTER_SECOND]) {
      expect(stripPlayback(batch, { early: true, nowMs, chapterSortById: map })).toBe(batch);
    }
  });
  it("chapterSortById 也接受普通物件", () => {
    const out = stripPlayback(batch, { early: false, nowMs: BETWEEN, chapterSortById: { c1: CH1, c3: CH3, c4: CH4, cA: APPENDIX1 } });
    expect(srcOf(out)).toEqual(["b0", "b1", "b3", null, null, null]);
  });
  it("chapterSortMap：空／壞輸入回空 Map，不炸", () => {
    expect(chapterSortMap([]).size).toBe(0);
    expect(chapterSortMap(null).size).toBe(0);
    expect(chapterSortMap(chapters).get("c4")).toBe(CH4);
  });
  it("向後相容：不傳 chapterSortById 時與舊行為一致（9/30 起全開、不分批）", () => {
    expect(stripPlayback(batch, { early: false, nowMs: BETWEEN })).toBe(batch);
    expect(stripPlayback(batch, { early: false, nowMs: FULL_RELEASE_MS })).toBe(batch);
    expect(srcOf(stripPlayback(batch, { early: false, nowMs: BEFORE_FIRST })))
      .toEqual(["b0", null, null, null, null, null]);
  });
  it("非陣列輸入原樣返回", () => {
    expect(stripPlayback(null, { early: false, nowMs: BETWEEN, chapterSortById: map })).toBeNull();
  });
});
