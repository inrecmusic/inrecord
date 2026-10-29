// components/classroom/score/pianoSampler.js — 鋼琴取樣發聲（Web Audio，瀏覽器端）
//
// 取樣：FluidR3_GM acoustic grand（public/score-piano/，授權見同資料夾 LICENSE.txt），
// C2–C7 每小三度一個、共 21 檔；其餘音高取最近的取樣變速（最多差一個半音半）。按需載入、同檔只抓一次。
// 取樣還沒載到（或載入失敗）時退回簡單合成音，不會整個沒聲音。
const NAMES = ["C", "Eb", "Gb", "A"];
export const SAMPLES = [];
for (let midi = 36; midi <= 96; midi += 3) SAMPLES.push({ name: `${NAMES[(midi - 36) / 3 % 4]}${Math.floor(midi / 12) - 1}`, midi });

export function nearestSample(midi) {
  const clamped = Math.max(SAMPLES[0].midi, Math.min(SAMPLES[SAMPLES.length - 1].midi, midi));
  let best = SAMPLES[0];
  for (const s of SAMPLES) if (Math.abs(s.midi - clamped) < Math.abs(best.midi - clamped)) best = s;
  return { name: best.name, rate: 2 ** ((midi - best.midi) / 12) };
}

export function createPianoSampler({ base = "/score-piano/" } = {}) {
  let ctx = null;
  let master = null;
  const buffers = new Map(); // name → AudioBuffer | Promise | null（失敗）
  const live = new Set();

  function ensure() {
    if (typeof window === "undefined") return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);
    }
    return ctx;
  }

  function loadOne(name) {
    if (buffers.has(name)) return buffers.get(name);
    const p = fetch(`${base}${name}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((ab) => new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)))
      .then((buf) => (buffers.set(name, buf), buf))
      .catch((e) => {
        console.warn("[pianoSampler] 取樣載入失敗", name, e?.message || e);
        buffers.set(name, null);
        return null;
      });
    buffers.set(name, p);
    return p;
  }

  async function load(midis) {
    if (!ensure()) return;
    const names = [...new Set(midis.map((m) => nearestSample(m).name))];
    await Promise.all(names.map(loadOne));
  }

  function track(node, until) {
    const item = { node, until };
    live.add(item);
    node.onended = () => live.delete(item);
  }

  function synth(midi, when, dur, vel) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(vel * 0.3, 0.0002), when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(dur, 0.15) + 0.3);
    o.connect(g);
    g.connect(master);
    o.start(when);
    o.stop(when + Math.max(dur, 0.15) + 0.35);
    track(o, when + dur);
  }

  function play(midi, when, dur, vel = 0.8) {
    if (!ensure()) return;
    const { name, rate } = nearestSample(midi);
    const buf = buffers.get(name);
    if (!(buf && typeof buf === "object" && "duration" in buf)) {
      loadOne(name);
      synth(midi, when, dur, vel);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel, when);
    const release = when + Math.max(dur, 0.08);
    g.gain.setTargetAtTime(0, release, 0.12); // 放開琴鍵：快速收掉
    src.connect(g);
    g.connect(master);
    src.start(when);
    src.stop(Math.min(release + 1.2, when + buf.duration / rate));
    track(src, release);
  }

  // 節拍器（原型 click()）
  function click(when, accent) {
    if (!ensure()) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = accent ? 1760 : 1180;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(accent ? 0.5 : 0.3, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
    o.connect(g);
    g.connect(master);
    o.start(when);
    o.stop(when + 0.06);
    track(o, when);
  }

  function stopAll() {
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const item of live) {
      try {
        item.node.stop(now + 0.02);
      } catch {
        /* 已停止 */
      }
    }
    live.clear();
  }

  return { ensure, load, play, click, stopAll, get context() { return ctx; } };
}
