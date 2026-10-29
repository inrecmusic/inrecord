import { describe, it, expect } from "vitest";
import { chordTones, romanOf, chordZh, recognizeChord, noteName, pitchName, jianpuDigit } from "./chords.js";

const sp = (s) => ({ step: s[0], alter: s[1] === "#" ? 1 : s[1] === "b" ? -1 : 0 });
const ch = (root, kind = "major", bass = null) => ({ root: sp(root), kind, bass: bass ? sp(bass) : null });
const C_MAJ = { fifths: 0, mode: "major", tonic: sp("C") };
const G_MAJ = { fifths: 1, mode: "major", tonic: sp("G") };
const F_MAJ = { fifths: -1, mode: "major", tonic: sp("F") };

describe("romanOf", () => {
  it("C 大調", () => {
    expect(romanOf(ch("C"), C_MAJ)).toBe("I");
    expect(romanOf(ch("G", "dominant"), C_MAJ)).toBe("V7");
    expect(romanOf(ch("A", "minor"), C_MAJ)).toBe("vi");
    expect(romanOf(ch("C", "major", "E"), C_MAJ)).toBe("I⁶");
    expect(romanOf(ch("B", "diminished"), C_MAJ)).toBe("vii°");
    expect(romanOf(ch("C", "major-seventh"), C_MAJ)).toBe("Imaj7");
    expect(romanOf(ch("C", "major", "G"), C_MAJ)).toBe("I⁶⁴");
  });
  it("G 大調、F 大調以主音為 I", () => {
    expect(romanOf(ch("D", "dominant"), G_MAJ)).toBe("V7");
    expect(romanOf(ch("E", "minor"), G_MAJ)).toBe("vi");
    expect(romanOf(ch("Bb"), F_MAJ)).toBe("IV");
  });
  it("調外和弦用降記號", () => expect(romanOf(ch("Bb"), C_MAJ)).toBe("♭VII"));
});

describe("chordTones／chordZh", () => {
  it("根音在 C3–B3", () => {
    expect(chordTones(ch("C"))).toEqual([48, 52, 55]);
    expect(chordTones(ch("G", "dominant"))).toEqual([55, 59, 62, 65]);
  });
  it("slash 和弦 bass 放最低", () => {
    const t = chordTones(ch("C", "major", "E"));
    expect(t[0]).toBe(40);
    expect(Math.min(...t)).toBe(40);
    expect(t.slice(1)).toEqual([48, 52, 55]);
  });
  it("中文性質", () => {
    expect(chordZh(ch("C"))).toBe("大三和弦");
    expect(chordZh(ch("G", "dominant"))).toBe("屬七和弦");
    expect(chordZh(ch("B", "diminished"))).toBe("減三和弦");
  });
});

describe("recognizeChord", () => {
  it("辨識三和弦與七和弦", () => {
    expect(recognizeChord([60, 64, 67]).name).toBe("C");
    expect(recognizeChord([60, 64, 67]).zh).toBe("大三和弦");
    expect(recognizeChord([62, 65, 69]).name).toBe("Dm");
    expect(recognizeChord([67, 71, 74, 77]).name).toBe("G7");
    expect(recognizeChord([64, 67, 72]).name).toBe("C"); // 轉位也認得
  });
  it("少於三個音回 null", () => {
    expect(recognizeChord([60, 64])).toBe(null);
    expect(recognizeChord([60, 61, 62])).toBe(null);
  });
});

describe("音名與簡譜", () => {
  it("noteName 依調號拼升降", () => {
    expect(noteName(61, G_MAJ)).toBe("C♯4");
    expect(noteName(70, F_MAJ)).toBe("B♭4");
    expect(noteName(60)).toBe("C4");
  });
  it("pitchName 用譜上寫法", () => {
    expect(pitchName({ step: "F", alter: 1, octave: 4 })).toBe("F♯4");
    expect(pitchName({ step: "E", alter: 0, octave: 3 })).toBe("E3");
  });
  it("jianpuDigit 以主音為 1", () => {
    expect(jianpuDigit({ step: "G", alter: 0, octave: 4 }, G_MAJ)).toEqual({ digit: "1", acc: "", octave: 0 });
    expect(jianpuDigit({ step: "F", alter: 1, octave: 4 }, G_MAJ)).toEqual({ digit: "7", acc: "", octave: -1 });
    expect(jianpuDigit({ step: "C", alter: 0, octave: 5 }, C_MAJ)).toEqual({ digit: "1", acc: "", octave: 1 });
    expect(jianpuDigit({ step: "C", alter: 1, octave: 5 }, G_MAJ)).toEqual({ digit: "4", acc: "♯", octave: 0 });
    expect(jianpuDigit({ step: "F", alter: 0, octave: 3 }, G_MAJ)).toEqual({ digit: "7", acc: "♭", octave: -2 });
  });
});
