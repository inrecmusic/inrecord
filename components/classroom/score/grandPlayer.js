// components/classroom/score/grandPlayer.js — 依 lib/score/timeline.js 的 Playback 排程播放（瀏覽器端）
// 整段一次排進 Web Audio（曲子短、事件數少），計時器只負責回報「現在亮哪些音」。
// repeat（A-B 循環）時，播到尾巴前先把下一輪排好，下一輪不再數預備拍。
import { activeIdsAt } from "@/lib/score/timeline";

const VEL = { 1: 0.85, 2: 0.65 }; // 右手旋律稍大聲

export function createGrandPlayer(sampler) {
  let pb = null;
  let repeat = false;
  let playing = false;
  let timer = null;
  let startedAt = 0;
  let nextStart = null;
  const tickFns = new Set();
  const endFns = new Set();

  function schedulePass(start, fromSec) {
    for (const e of pb.events) if (e.at >= fromSec - 1e-6) sampler.play(e.midi, start + e.at, e.dur, VEL[e.staff] || 0.75);
    for (const c of pb.clicks) if (c.at >= fromSec - 1e-6) sampler.click(start + c.at, c.accent);
  }

  function emit(ids, t) {
    for (const fn of tickFns) fn(ids, t);
  }

  function tick() {
    const ctx = sampler.context;
    if (!ctx || !playing) return;
    let t = ctx.currentTime - startedAt;
    if (repeat && nextStart === null && t >= pb.duration - 0.4) {
      nextStart = startedAt + pb.duration - pb.countIn;
      schedulePass(nextStart, pb.countIn);
    }
    if (t >= pb.duration) {
      if (repeat && nextStart !== null) {
        startedAt = nextStart;
        nextStart = null;
        t = ctx.currentTime - startedAt;
      } else {
        stop();
        for (const fn of endFns) fn();
        return;
      }
    }
    emit(t >= 0 ? activeIdsAt(pb, t) : new Set(), t);
  }

  function stop() {
    const was = playing;
    playing = false;
    clearInterval(timer);
    timer = null;
    nextStart = null;
    sampler.stopAll();
    if (was) emit(new Set(), 0);
  }

  return {
    load(playback, { repeat: r = false } = {}) {
      stop();
      pb = playback;
      repeat = !!r;
    },
    async play() {
      const ctx = sampler.ensure();
      if (!ctx || !pb) return false;
      stop();
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});
      await sampler.load([...new Set(pb.events.map((e) => e.midi))]);
      startedAt = ctx.currentTime + 0.1;
      schedulePass(startedAt, 0);
      playing = true;
      timer = setInterval(tick, 30);
      return true;
    },
    stop,
    onTick(fn) {
      tickFns.add(fn);
      return () => tickFns.delete(fn);
    },
    onEnd(fn) {
      endFns.add(fn);
      return () => endFns.delete(fn);
    },
    dispose() {
      stop();
      tickFns.clear();
      endFns.clear();
    },
    get playing() {
      return playing;
    },
  };
}
