import { describe, it, expect } from "vitest";
import { buildHubModel, greetingLine, nextRelease, relativeDayLabel, splitChapterTitle, splitUnitTitle, durationLabel, durationShort, cnNum, orderVideos, lockedNote } from "./hub-view.js";

const tw = (s) => Date.parse(`${s}+08:00`);
const NOW = tw("2026-09-25T21:00:00"); // 台灣 9/25 週五晚上

const chapters = [
  { id: "c1", title: "Ch1 踏上黑白鍵的第一步", sort_order: 0 },
  { id: "c2", title: "Ch2 音符的語言—音名與唱名", sort_order: 1 },
  { id: "c3", title: "Ch3 看懂樂譜—五線譜與簡譜", sort_order: 2 },
  { id: "c4", title: "Ch4 掌握音樂的腳步—節奏與拍子", sort_order: 3 },
  { id: "a1", title: "附錄1 如何更有效率地練琴？", sort_order: 10 },
];
const v = (id, ch, title, playable = true, duration = "05:00") => ({ id, chapter_id: ch, title, playable, duration });
const videos = [
  v("v11", "c1", "1-1 認識鋼琴鍵盤"), v("v12", "c1", "1-2 尋找起始音 Do"), v("v13", "c1", "1-3 彈鋼琴的坐姿"),
  v("v14", "c1", "1-4 手型與觸鍵", false, null), v("v15", "c1", "1-5 認識手指編號 (指法)"),
  v("v21", "c2", "2-1 認識音名 C、D、E、F、G、A、B", true, "07:36"), v("v22", "c2", "2-2 認識唱名", true, "06:06"),
  v("v31", "c3", "3-1 認識五線譜", false, null), v("v41", "c4", "4-1 認識拍子與小節", false, null),
];
const done = (id, daysAgo) => ({ video_id: id, completed: true, watched_at: new Date(NOW - daysAgo * 86_400_000).toISOString() });
const progress = [done("v11", 12), done("v12", 10), done("v13", 3.2), done("v15", 3)]; // 1-5 是最後看的

describe("小工具", () => {
  it("cnNum", () => { expect(cnNum(2)).toBe("二"); expect(cnNum(10)).toBe("十"); expect(cnNum(12)).toBe("十二"); });
  it("relativeDayLabel 以台灣日界算", () => {
    expect(relativeDayLabel(NOW - 3 * 86_400_000, NOW)).toBe("3 天前");
    expect(relativeDayLabel(tw("2026-09-24T23:30:00"), NOW)).toBe("昨天");
    expect(relativeDayLabel(tw("2026-09-30T00:00:00"), NOW)).toBe("5 天後");
  });
  it("章節標題拆成主標／副標／羅馬數字；附錄另計", () => {
    expect(splitChapterTitle("Ch2 音符的語言—音名與唱名")).toMatchObject({ num: 2, main: "音符的語言", sub: "音名與唱名", label: "Ⅱ", isAppendix: false });
    expect(splitChapterTitle("附錄1 如何更有效率地練琴？")).toMatchObject({ main: "如何更有效率地練琴？", label: "附錄一", isAppendix: true });
  });
  it("單元標題拆編號", () => {
    expect(splitUnitTitle("2-1 認識音名 C、D、E、F、G、A、B")).toEqual({ no: "2-1", name: "認識音名 C、D、E、F、G、A、B", ref: "2-1" });
    expect(splitUnitTitle("試看：第一堂")).toEqual({ no: "", name: "試看：第一堂", ref: "試看：第一堂" });
  });
  it("時長文案", () => {
    expect(durationLabel("07:36")).toBe("7 分 36 秒"); expect(durationLabel("05:00")).toBe("5 分鐘"); expect(durationLabel(null)).toBe("");
    expect(durationShort("07:36")).toBe("7:36"); expect(durationShort("05:09")).toBe("5:09");
  });
});

describe("buildHubModel（早鳥、第二章剛上架）", () => {
  const m = buildHubModel({ chapters, videos, progress, earlyAccess: true, nowMs: NOW, openedGames: ["音名快閃"] });

  it("接著看＝第一支可播且未完成（2-1），含章節與時長文案", () => {
    expect(m.nextVideo.id).toBe("v21");
    expect(m.hero).toMatchObject({ no: "2-1", name: "認識音名 C、D、E、F、G、A、B", chapterLabel: "第二章", duration: "7 分 36 秒", durationShort: "7:36", positionInChapter: 1, chapterNew: true, chapterNewLabel: "2 天前上架" });
  });
  it("進度分母是已開放單元：看了 4 / 開放 6 → 67%；近 7 天 2 課", () => {
    expect(m).toMatchObject({ opened: 6, watched: 4, pct: 67, weekCount: 2 });
  });
  it("上次看到 1-5，3 天前", () => expect(m.lastWatched).toMatchObject({ no: "1-5", when: "3 天前" }));
  it("章節卡狀態：Ⅰ 進行中、Ⅱ 新上架、Ⅲ 9/30 開放、Ⅳ 10/7 開放、附錄 10/31 開放", () => {
    const by = Object.fromEntries(m.chapters.map((c) => [c.id, c]));
    expect(by.c1).toMatchObject({ label: "Ⅰ", state: "progress", done: 4, units: 5, note: "已看 4 / 5 單元", isNow: false });
    expect(by.c2).toMatchObject({ label: "Ⅱ", state: "ready", note: "2 單元", isNew: true, newLabel: "2 天前上架", isNow: true, href: "/classroom/watch?v=v21" });
    expect(by.c3).toMatchObject({ label: "Ⅲ", state: "locked", note: "9/30 開放", href: "/classroom/watch" });
    expect(by.c4).toMatchObject({ state: "locked", note: "10/7 開放" }); // Ch4 延到 10/7，與 Ch5 同天
    expect(by.a1).toMatchObject({ label: "附錄一", isAppendix: true, state: "locked", note: "10/31 開放" });
  });
  it("第一章的目標單元＝第一支可播未完成（1-4 沒影片跳過）→ 全看完就回第一支", () => {
    const c1 = m.chapters.find((c) => c.id === "c1");
    expect(c1.href).toBe("/classroom/watch?v=v11"); // v11/v12/v13/v15 都完成、v14 不可播 → 回第一支可播
  });
  it("本章單元列：2-1 next、2-2 todo", () => {
    expect(m.lessons.map((l) => [l.no, l.state, l.duration])).toEqual([["2-1", "next", "7:36"], ["2-2", "todo", "6:06"]]);
  });
  it("遊戲間：第二章三款，音名快閃已上傳", () => {
    expect(m.games.map((g) => [g.name, g.opened, g.href])).toEqual([
      ["音名快閃", true, "/classroom/watch?v=v21"], ["唱名小達人", false, "/classroom/watch?v=v22"], ["音名唱名連連看", false, "/classroom/watch"],
    ]);
  });
  it("下一次開放：第三章 9/30（5 天後）", () => expect(m.nextOpen).toEqual({ label: "第三章", date: "9/30", inDays: 5 }));
  it("問候句：第二章 2 天前上架了，從 2-1 接下去（中文接數字留空格）", () => expect(greetingLine(m, true)).toBe("第二章 2 天前上架了，從 2-1 接下去就好。"));
  it("接著看帶上次停的位置：2-1 沒看過 → 0:00／0%", () => expect(m.hero).toMatchObject({ resumeAt: 0, resumeLabel: "0:00", resumePct: 0 }));
  it("接著看有看到一半 → 進度位置", () => {
    const m2 = buildHubModel({ chapters, videos, progress: [...progress, { video_id: "v21", completed: false, watched_seconds: 228, total_seconds: 456, watched_at: new Date(NOW - 3_600_000).toISOString() }], earlyAccess: true, nowMs: NOW });
    expect(m2.hero).toMatchObject({ no: "2-1", resumeAt: 228, resumeLabel: "3:48", resumePct: 50 });
    expect(greetingLine(m2, true)).toBe("2-1 看到一半，從上次停的地方接下去。"); // 看到一半優先於「新章上架」文案
  });
});

describe("審查補的邊界", () => {
  it("videos.sort_order 是章內序號：bootstrap 跨章交錯的順序要先攤平成課程順序再找「接著看」", () => {
    // bootstrap 全域排序：1-1(0)、2-1(0)、1-2(1)、2-2(1)
    const inter = [v("v11", "c1", "1-1 A"), v("v21", "c2", "2-1 C"), v("v12", "c1", "1-2 B"), v("v22", "c2", "2-2 D")].map((x, i) => ({ ...x, sort_order: [0, 0, 1, 1][i] }));
    expect(orderVideos(chapters, inter).map((x) => x.id)).toEqual(["v11", "v12", "v21", "v22"]);
    const m = buildHubModel({ chapters, videos: inter, progress: [done("v11", 1)], earlyAccess: true, nowMs: NOW });
    expect(m.nextVideo.id).toBe("v12");
    expect(m.currentChapter.label).toBe("Ⅰ");
    expect(m.lessons.map((l) => l.no)).toEqual(["1-1", "1-2"]);
  });
  it("試看單元不算課程：不當接著看、不進分母；非早鳥 9/30 前只有試看可播 → 仍是鎖定畫面", () => {
    const vs = [{ id: "t1", chapter_id: "c1", title: "試看：第一堂", playable: true, sort_order: 0 }, { id: "v11", chapter_id: "c1", title: "1-1 A", playable: false, sort_order: 1 }];
    const m = buildHubModel({ chapters: chapters.slice(0, 1), videos: vs, progress: [], earlyAccess: false, nowMs: NOW });
    expect(m.nextVideo).toBeNull(); expect(m.opened).toBe(0);
    expect(m.chapters[0]).toMatchObject({ state: "locked", note: "9/30 開放", units: 1 });
    expect(greetingLine(m, false)).toBe("第一批章節 9/30 開放，開放後從這裡接著上。");
  });
  it("沒有編號的單元（附錄影片）→ 句子用單元名，不會出現空字串", () => {
    const vs = [{ id: "a", chapter_id: "a1", title: "如何更有效率地練琴", playable: true, sort_order: 0 }];
    const m = buildHubModel({ chapters: [chapters[4]], videos: vs, progress: [], earlyAccess: true, nowMs: NOW });
    expect(m.hero).toMatchObject({ no: "", ref: "如何更有效率地練琴", chapterLabel: "附錄一" });
    expect(greetingLine(m, true)).toBe("從 如何更有效率地練琴 開始，我們慢慢來。");
  });
  it("最新一筆進度指向已下架影片 → 退到次新的一筆；孤兒進度不算近 7 天", () => {
    const m = buildHubModel({ chapters, videos, progress: [...progress, { video_id: "gone", completed: true, watched_at: new Date(NOW - 3_600_000).toISOString() }], earlyAccess: true, nowMs: NOW });
    expect(m.lastWatched.no).toBe("1-5"); expect(m.weekCount).toBe(2);
  });
  it("最近看到一半的單元優先當「接著看」，即使前面還有沒看的", () => {
    // 2-1 沒看、2-2 昨天看到一半 → 接著看 2-2
    const m = buildHubModel({ chapters, videos, progress: [...progress, { video_id: "v22", completed: false, watched_seconds: 100, total_seconds: 366, watched_at: new Date(NOW - 86_400_000).toISOString() }], earlyAccess: true, nowMs: NOW });
    expect(m.nextVideo.id).toBe("v22");
    expect(m.hero).toMatchObject({ no: "2-2", resumeAt: 100, resumePct: 27 });
    expect(greetingLine(m, true)).toBe("2-2 看到一半，從上次停的地方接下去。");
  });
  it("鎖定章節的日期保險絲：上架日到了影片還沒掛上 → 即將上架", () => {
    expect(lockedNote("2026-09-30", NOW)).toBe("9/30 開放");
    expect(lockedNote("2026-09-23", NOW)).toBe("即將上架");
    // 當天就算到期：9/25 當天還沒掛上，寫「9/25 開放」只會讓人以為壞掉
    expect(lockedNote("2026-09-25", NOW)).toBe("即將上架");
    // 但非早鳥的批次時刻還沒到（openPassed=false）→ 仍照實寫哪天開放
    expect(lockedNote("2026-09-25", NOW, false)).toBe("9/25 開放");
    // 非早鳥 9/30 後：Ch1～3 沒影片 → 不再說 10/31，用章節時程（9/30 已過 → 即將上架），與播放頁側欄一致
    const after = tw("2026-10-02T12:00:00");
    const m = buildHubModel({ chapters, videos: videos.map((x) => ({ ...x, playable: false })), progress: [], earlyAccess: false, nowMs: after });
    expect(m.chapters.map((c) => c.note)).toEqual(["即將上架", "即將上架", "即將上架", "10/31 開放", "10/31 開放"]);
  });
  it("非早鳥 9/30 當晚：開放前寫「9/30 開放」，20:00 放行後沒影片的 Ch3 改寫「即將上架」", () => {
    const mk = (nowMs) => buildHubModel({ chapters, videos, progress: [], earlyAccess: false, nowMs })
      .chapters.find((c) => c.num === 3).note;
    expect(mk(tw("2026-09-30T19:00:00"))).toBe("9/30 開放"); // 批次時刻還沒到
    expect(mk(tw("2026-09-30T20:30:00"))).toBe("即將上架");   // 放行了但影片還沒掛上
  });
  it("非早鳥的「新上架」以批次日算（9/30），不用早鳥的章節日", () => {
    const after = tw("2026-10-02T12:00:00");
    const m = buildHubModel({ chapters, videos, progress: [], earlyAccess: false, nowMs: after });
    expect(m.chapters[1]).toMatchObject({ isNew: true, newLabel: "2 天前上架" }); // Ch2 早鳥 9/23、非早鳥 9/30
  });
});

describe("buildHubModel（非早鳥 9/30 前：全部不可播）", () => {
  const locked = videos.map((x) => ({ ...x, playable: false }));
  const m = buildHubModel({ chapters, videos: locked, progress: [], earlyAccess: false, nowMs: NOW });
  it("沒有接著看、進度 0/0、下一次開放＝第一批 9/30", () => {
    expect(m.nextVideo).toBeNull(); expect(m.hero).toBeNull();
    expect(m).toMatchObject({ opened: 0, watched: 0, pct: 0 });
    expect(m.nextOpen).toEqual({ label: "第一批章節（第一到三章）", date: "9/30", inDays: 5 });
  });
  it("章節卡：Ch1～Ch3 9/30 開放、Ch4 與附錄 10/31 開放", () => {
    expect(m.chapters.map((c) => c.note)).toEqual(["9/30 開放", "9/30 開放", "9/30 開放", "10/31 開放", "10/31 開放"]);
  });
  it("問候句沿用既有文案", () => expect(greetingLine(m, false)).toBe("第一批章節 9/30 開放，開放後從這裡接著上。"));
});

describe("nextRelease（早鳥）", () => {
  it("日期已過但影片還沒掛上的章不預告舊日期，跳到下一個", () => {
    // 9/25 看：Ch2 9/23 已過（且沒影片）→ 略過；下一個是 9/30 的 Ch3（Ch4 已延到 10/7）
    const r = nextRelease({ early: true, nowMs: NOW, chapters, playableByChapter: new Map() });
    expect(r).toEqual({ label: "第三章", date: "9/30", inDays: 5 });
  });
  it("全部上架後 → null", () => {
    expect(nextRelease({ early: undefined, nowMs: tw("2026-11-05T12:00:00"), chapters, playableByChapter: new Map() })).toBeNull();
  });
  it("非早鳥 9/30 後、10/31 前 → 全部章節 10/31", () => {
    expect(nextRelease({ early: false, nowMs: tw("2026-10-05T12:00:00") })).toEqual({ label: "全部章節", date: "10/31", inDays: 26 });
  });
});
