import { describe, it, expect } from "vitest";
import { nearestSample, SAMPLES } from "./pianoSampler.js";

describe("nearestSample", () => {
  it("取樣清單：C2 到 C7 每小三度一個，共 21 個", () => {
    expect(SAMPLES.length).toBe(21);
    expect(SAMPLES[0]).toEqual({ name: "C2", midi: 36 });
    expect(SAMPLES[1].name).toBe("Eb2");
    expect(SAMPLES[2].name).toBe("Gb2");
    expect(SAMPLES[20]).toEqual({ name: "C7", midi: 96 });
  });
  it("剛好有取樣就原速", () => expect(nearestSample(60)).toEqual({ name: "C4", rate: 1 }));
  it("取較近的取樣並算變速", () => {
    const r = nearestSample(62); // C4 差 2、Eb4 差 1
    expect(r.name).toBe("Eb4");
    expect(r.rate).toBeCloseTo(2 ** (-1 / 12));
    const s = nearestSample(61);
    expect(s.name).toBe("C4");
    expect(s.rate).toBeCloseTo(2 ** (1 / 12));
  });
  it("超出音域夾到兩端", () => {
    expect(nearestSample(30).name).toBe("C2");
    expect(nearestSample(30).rate).toBeCloseTo(2 ** (-6 / 12));
    expect(nearestSample(110).name).toBe("C7");
  });
});
