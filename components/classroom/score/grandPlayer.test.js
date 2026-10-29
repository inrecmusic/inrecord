import { describe, it, expect, vi, afterEach } from "vitest";
import { createGrandPlayer } from "./grandPlayer.js";
import { createPianoSampler } from "./pianoSampler.js";

const PB = { events: [{ midi: 60, staff: 1, at: 0, dur: 1, segs: [{ id: "n0", at: 0 }] }], clicks: [], duration: 1, countIn: 0, measureTimes: [] };
function fakeSampler() {
  let release;
  let gate = null;
  const ctx = { currentTime: 0, state: "running", resume: async () => {} };
  return {
    ctx,
    loadGate: () => (gate ??= new Promise((r) => (release = r))),
    release: () => release(),
    ensure: () => ctx,
    load: vi.fn(),
    play: vi.fn(),
    click: vi.fn(),
    stopAll: vi.fn(),
    close: vi.fn(),
    get context() { return ctx; },
  };
}

describe("createGrandPlayer：播放前等待載入時的競態", () => {
  it("等待中按停止 → 載入完成後不會開始播放", async () => {
    const s = fakeSampler();
    s.load.mockImplementation(() => s.loadGate());
    const p = createGrandPlayer(s);
    p.load(PB);
    const started = p.play();
    p.stop();
    s.release();
    expect(await started).toBe(false);
    expect(s.play).not.toHaveBeenCalled();
    expect(p.playing).toBe(false);
    p.dispose();
  });

  it("等待中再按一次播放 → 只排一次音", async () => {
    const s = fakeSampler();
    s.load.mockImplementation(() => s.loadGate());
    const p = createGrandPlayer(s);
    p.load(PB);
    const a = p.play();
    const b = p.play();
    s.release();
    await Promise.all([a, b]);
    expect(s.play).toHaveBeenCalledTimes(1);
    p.dispose();
  });

  it("dispose 會關掉音訊", () => {
    const s = fakeSampler();
    createGrandPlayer(s).dispose();
    expect(s.close).toHaveBeenCalled();
  });
});

describe("createPianoSampler：AudioContext", () => {
  afterEach(() => delete globalThis.window);

  it("建立失敗（Safari 數量上限）→ ensure 回 null、不丟例外", () => {
    globalThis.window = { AudioContext: class { constructor() { throw new Error("too many contexts"); } } };
    expect(createPianoSampler().ensure()).toBe(null);
  });

  it("close 會關掉 AudioContext，之後可重建", () => {
    const close = vi.fn(async () => {});
    let made = 0;
    globalThis.window = {
      AudioContext: class {
        constructor() { made++; this.destination = {}; }
        createGain() { return { gain: { value: 1 }, connect() {} }; }
        close() { return close(); }
      },
    };
    const s = createPianoSampler();
    s.ensure();
    s.close();
    expect(close).toHaveBeenCalledTimes(1);
    s.ensure();
    expect(made).toBe(2);
  });
});
