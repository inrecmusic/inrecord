// components/classroom/scorePlayer.js — 樂譜跟奏（Web Audio，瀏覽器端）
//
// 不依賴外部音源檔或 CDN：用幾個諧波疊加＋指數衰減包絡合成鋼琴音，
// 對「跟著練節奏與音高」夠用，也不必把幾 MB 的取樣檔放進站台或改 CSP。
// 時間軸由 lib/score/playback.js 純函式算好（可測），這裡只負責發聲與回報播放位置。
const HARMONICS = [
  { ratio: 1, gain: 1, decay: 1 },
  { ratio: 2, gain: 0.34, decay: 0.7 },
  { ratio: 3, gain: 0.13, decay: 0.5 },
  { ratio: 4, gain: 0.06, decay: 0.38 },
];

export function createScorePlayer() {
  let ctx = null, master = null, timer = null, startedAt = 0, offset = 0;
  let evs = [], total = 0, onTick = null, onEnd = null, live = [];

  const ensure = () => {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.22; // 合成音泛音多，壓低一點才不刺耳
      master.connect(ctx.destination);
    }
    return ctx;
  };

  function voice(freq, at, dur) {
    const end = at + Math.max(dur, 0.12) + 0.25;
    for (const h of HARMONICS) {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq * h.ratio;
      const peak = h.gain * (h.ratio > 1 ? 0.6 : 1);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), at + 0.012); // 擊弦
      g.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(dur, 0.12) * h.decay + 0.2);
      osc.connect(g); g.connect(master);
      osc.start(at); osc.stop(end);
      live.push(osc);
    }
  }

  function schedule(fromSec) {
    live = [];
    const base = ctx.currentTime + 0.08;
    for (const e of evs) {
      if (e.at + e.dur <= fromSec) continue;
      voice(440 * Math.pow(2, (e.midi - 69) / 12), base + Math.max(0, e.at - fromSec), e.dur);
    }
    startedAt = base; offset = fromSec;
    clearInterval(timer);
    timer = setInterval(() => {
      const t = position();
      onTick?.(t);
      if (t >= total) { stop(); onEnd?.(); }
    }, 60);
  }

  const position = () => (ctx ? Math.max(0, offset + (ctx.currentTime - startedAt)) : 0);

  function stop() {
    clearInterval(timer); timer = null;
    for (const o of live) { try { o.stop(); } catch {} }
    live = [];
  }

  return {
    /** events/duration 來自 lib/score/playback.js 的 buildTimeline */
    load({ events, duration }) { evs = events || []; total = duration || 0; },
    async play(fromSec = 0) {
      if (!ensure()) return false;
      if (ctx.state === "suspended") await ctx.resume(); // 手機第一次要使用者手勢
      stop();
      schedule(fromSec);
      return true;
    },
    stop,
    position,
    get playing() { return !!timer; },
    onTick(fn) { onTick = fn; },
    onEnd(fn) { onEnd = fn; },
    dispose() { stop(); try { ctx?.close(); } catch {} ctx = null; },
  };
}
