import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseMusicXml } from "./musicxml.js";
import { playOrder, buildPlayback, activeIdsAt, DEFAULT_BPM } from "./timeline.js";

const fx = (name) => parseMusicXml(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const bee = fx("twinkle-grand.musicxml");
const st = fx("stress.musicxml");
const BOTH = { rh: true, lh: true };
const opts = (o = {}) => ({ bpm: 60, hands: BOTH, loop: null, countIn: false, metronome: false, ...o });
const idsOf = (m, measure, staff) => m.notes.filter((n) => n.measure === measure && (!staff || n.staff === staff)).map((n) => n.id);

describe("playOrder", () => {
  it("反覆展開：第一結尾後回到反覆起點、第二遍走第二結尾", () => {
    expect(playOrder(st)).toEqual([0, 1, 2, 3, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
  it("沒有反覆就照順序", () => expect(playOrder(bee)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]));
  it("反覆終沒有反覆起時回到開頭", () => {
    const m = { measures: [0, 1, 2].map((i) => ({ index: i, repeatStart: false, repeatEnd: i === 1, repeatTimes: 2, ending: null })) };
    expect(playOrder(m)).toEqual([0, 1, 0, 1, 2]);
  });
});

describe("buildPlayback", () => {
  it("DEFAULT_BPM", () => expect(DEFAULT_BPM).toBe(84));

  it("速度：bpm 120 第 1 小節第 2 個右手音在 0.5 秒", () => {
    const pb = buildPlayback(bee, opts({ bpm: 120 }));
    const second = bee.notes.filter((n) => n.measure === 0 && n.staff === 1)[1];
    expect(pb.events.find((e) => e.segs[0].id === second.id).at).toBeCloseTo(0.5);
    expect(pb.countIn).toBe(0);
    expect(pb.duration).toBeCloseTo(8 * 4 * 0.5);
  });

  it("連結線合併成一個事件", () => {
    const pb = buildPlayback(st, opts());
    const tied = pb.events.filter((e) => e.segs.length === 2);
    expect(tied.length).toBe(1);
    expect(tied[0].midi).toBe(74);
    expect(tied[0].dur).toBeCloseTo(2);
    expect(tied[0].segs[1].at).toBeCloseTo(tied[0].at + 1);
  });

  it("單手靜音：只播右手但小節時間不變", () => {
    const both = buildPlayback(bee, opts());
    const rh = buildPlayback(bee, opts({ hands: { rh: true, lh: false } }));
    expect(rh.events.some((e) => e.staff === 2)).toBe(false);
    expect(rh.events.length).toBeGreaterThan(0);
    expect(rh.measureTimes).toEqual(both.measureTimes);
    expect(rh.duration).toBe(both.duration);
  });

  it("預備拍：一整小節、第一拍重音", () => {
    const pb = buildPlayback(bee, opts({ countIn: true, metronome: true }));
    expect(pb.countIn).toBeCloseTo(4);
    expect(Math.min(...pb.events.map((e) => e.at))).toBeCloseTo(4);
    expect(pb.clicks.slice(0, 4).map((c) => c.at)).toEqual([0, 1, 2, 3]);
    expect(pb.clicks.slice(0, 4).map((c) => c.accent)).toEqual([true, false, false, false]);
    expect(pb.clicks[4]).toEqual({ at: 4, accent: true });
  });

  it("預備拍不受節拍器開關影響", () => {
    const pb = buildPlayback(bee, opts({ countIn: true, metronome: false }));
    expect(pb.clicks.length).toBe(4);
  });

  it("弱起：預備拍＝一小節減掉弱起長度，重拍一路對齊", () => {
    const pb = buildPlayback(st, opts({ countIn: true, metronome: true }));
    expect(pb.countIn).toBeCloseTo(3); // 4/4、弱起一拍 → 數 1 2 3，弱起音落在第 4 拍
    const first = pb.events.reduce((a, b) => (a.at <= b.at ? a : b));
    expect(first.at).toBeCloseTo(3);
    expect(first.midi).toBe(62);
    expect(pb.measureTimes[1]).toEqual({ measure: 1, at: 4 });
    expect(pb.clicks.filter((c) => c.at < 5).map((c) => [c.at, c.accent])).toEqual([[0, true], [1, false], [2, false], [3, false], [4, true]]);
  });

  it("循環從一般小節開始時預備拍仍是一整小節", () => {
    const pb = buildPlayback(st, opts({ countIn: true, loop: { from: 1, to: 2 } }));
    expect(pb.countIn).toBeCloseTo(4);
  });

  it("6/8 每附點四分一下節拍", () => {
    const pb = buildPlayback(st, opts({ metronome: true }));
    const m7 = pb.measureTimes.find((x) => x.measure === 7).at;
    const inM7 = pb.clicks.filter((c) => c.at >= m7 - 1e-9 && c.at < m7 + 3 - 1e-9);
    expect(inM7.map((c) => c.at - m7)).toEqual([0, 1.5]);
  });

  it("A-B 循環：只含起訖小節、從 0 起算、不走反覆", () => {
    const pb = buildPlayback(st, opts({ loop: { from: 2, to: 3 } }));
    expect(pb.measureTimes).toEqual([{ measure: 2, at: 0 }, { measure: 3, at: 4 }]);
    const allowed = new Set([...idsOf(st, 2), ...idsOf(st, 3)]);
    expect(pb.events.every((e) => e.segs.every((s) => allowed.has(s.id)))).toBe(true);
    expect(Math.min(...pb.events.map((e) => e.at))).toBe(0);
    expect(pb.duration).toBeCloseTo(8);
    const withCount = buildPlayback(st, opts({ loop: { from: 2, to: 3 }, countIn: true }));
    expect(withCount.measureTimes[0].at).toBeCloseTo(4);
  });

  it("反覆時同一小節的音出現兩次", () => {
    const pb = buildPlayback(st, opts());
    const id = idsOf(st, 2, 1)[0];
    expect(pb.events.filter((e) => e.segs.some((s) => s.id === id)).length).toBe(2);
  });
});

describe("activeIdsAt", () => {
  it("正在響的音（含同時按的左手和弦）", () => {
    const pb = buildPlayback(bee, opts());
    const ids = activeIdsAt(pb, 0.5);
    expect(ids.has("n0")).toBe(true);
    for (const id of idsOf(bee, 0, 2).slice(0, 3)) expect(ids.has(id)).toBe(true);
    expect(activeIdsAt(pb, 1.2).has("n0")).toBe(false);
  });
  it("連結線第二段亮第二段的 id", () => {
    const pb = buildPlayback(st, opts());
    const ev = pb.events.find((e) => e.segs.length === 2);
    expect(activeIdsAt(pb, ev.at + 0.5).has(ev.segs[0].id)).toBe(true);
    const later = activeIdsAt(pb, ev.at + 1.5);
    expect(later.has(ev.segs[1].id)).toBe(true);
    expect(later.has(ev.segs[0].id)).toBe(false);
  });
});
