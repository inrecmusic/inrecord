import { describe, it, expect } from "vitest";
import { parseAbc, parseKey, validateAbc, AbcError } from "./abc.js";

const BEE = `X:1
T:小蜜蜂
C:右手旋律
M:2/4
L:1/8
Q:1/4=96
K:C
"C" G2 E E | "G7" F2 D D | "C" C D E F | "C" G2 G2 |`;

describe("parseKey", () => {
  it("大調", () => {
    expect(parseKey("C")).toEqual({ tonic: "C", mode: "major", sharps: 0 });
    expect(parseKey("G")).toEqual({ tonic: "G", mode: "major", sharps: 1 });
    expect(parseKey("F")).toEqual({ tonic: "F", mode: "major", sharps: -1 });
  });
  it("小調用關係大調的調號", () => {
    expect(parseKey("Am")).toMatchObject({ tonic: "A", mode: "minor", sharps: 0 });
    expect(parseKey("Em")).toMatchObject({ tonic: "E", mode: "minor", sharps: 1 });
  });
  it("看不懂時退回 C 大調，不丟例外", () => expect(parseKey("???")).toMatchObject({ tonic: "C", sharps: 0 }));
});

describe("parseAbc（小蜜蜂）", () => {
  const m = parseAbc(BEE);
  it("標頭", () => {
    expect(m).toMatchObject({ title: "小蜜蜂", subtitle: "右手旋律", tempo: 96, unitLen: 0.125 });
    expect(m.meter).toEqual({ beats: 2, unit: 4 });
    expect(m.key).toMatchObject({ tonic: "C", sharps: 0 });
  });
  it("小節與和弦", () => {
    expect(m.measures.length).toBe(4);
    expect(m.measures.map((x) => x.chord)).toEqual(["C", "G7", "C", "C"]);
  });
  it("音高、度數、時值（G2＝一拍、E＝半拍）", () => {
    const [g, e1, e2] = m.measures[0].notes;
    expect(g).toMatchObject({ midi: 67, deg: 5, oct: 0, beats: 1, rest: false });
    expect(e1).toMatchObject({ midi: 64, deg: 3, beats: 0.5 });
    expect(e2.index).toBe(2); // 連號給播放高亮用
  });
  it("noteCount 只算實際音符", () => expect(m.noteCount).toBe(12));
});

describe("parseAbc 各種寫法", () => {
  const head = "X:1\nM:4/4\nL:1/4\nK:C\n";
  const notes = (abc) => parseAbc(head + abc).measures.flatMap((x) => x.notes);

  it("八度符號：c 高八度、C, 低八度", () => {
    const [a, b, c] = notes("C c C, |");
    expect([a.midi, b.midi, c.midi]).toEqual([60, 72, 48]);
    expect([a.oct, b.oct, c.oct]).toEqual([0, 1, -1]);
  });
  it("時值：C2 兩拍、C/ 半拍、C3/2 一拍半", () => {
    expect(notes("C2 C/ C3/2 |").map((n) => n.beats)).toEqual([2, 0.5, 1.5]);
  });
  it("休止符不佔 index、但佔拍子", () => {
    const ns = notes("C z2 C |");
    expect(ns[1]).toMatchObject({ rest: true, deg: 0, beats: 2, index: -1 });
    expect(ns.map((n) => n.index)).toEqual([0, -1, 1]);
  });
  it("連音線標在前一個音符上", () => {
    expect(notes("C- C |")[0].tied).toBe(true);
  });
  it("臨時升記號只在該小節有效", () => {
    const ns = notes("^F F | F |");
    expect(ns.map((n) => n.midi)).toEqual([66, 66, 65]);
    expect(ns[0].acc).toBe(1);
  });
  it("調號的升降自動套用：G 大調的 F 是升 F，簡譜仍是 7 不加升記號", () => {
    const m = parseAbc("X:1\nM:4/4\nL:1/4\nK:G\nG A B ^c | F |");
    const ns = m.measures.flatMap((x) => x.notes);
    expect(ns[0]).toMatchObject({ midi: 67, deg: 1, oct: 0 });  // G＝主音
    expect(ns[3]).toMatchObject({ midi: 73, deg: 4, acc: 1 });  // 升 C＝升 4
    expect(ns[4]).toMatchObject({ midi: 66, deg: 7, acc: 0 });  // 調號的升 F＝7
  });
  it("G 大調的高音 c 是第 4 度、不是高八度", () => {
    const ns = parseAbc("X:1\nM:4/4\nL:1/4\nK:G\nG c |").measures.flatMap((x) => x.notes);
    expect(ns[1]).toMatchObject({ deg: 4, oct: 0, midi: 72 });
  });
  it("反覆記號與註解不會變成音符", () => {
    const m = parseAbc(head + "|: C D :| % 反覆\nE |");
    expect(m.measures.map((x) => x.notes.length)).toEqual([2, 1]);
  });
});

describe("錯誤與檢查", () => {
  it("空白 → 明確訊息", () => expect(() => parseAbc("  ")).toThrow(AbcError));
  it("多聲部 → 擋下並說明", () => {
    expect(() => parseAbc("X:1\nK:C\nV:1\nC |")).toThrow(/單聲部/);
  });
  it("引號沒成對 → 明確訊息", () => {
    expect(validateAbc('X:1\nK:C\n"C C |')).toMatchObject({ ok: false, error: expect.stringContaining("引號") });
  });
  it("看不懂的符號 → 指出是哪一個", () => {
    expect(validateAbc("X:1\nK:C\nC H |").error).toContain("H");
  });
  it("拍數不符只警告不擋（首尾允許弱起與結尾）", () => {
    const r = validateAbc("X:1\nM:4/4\nL:1/4\nK:C\nC | C D | C D E F | C |");
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual(["第 2 小節有 2 拍，拍號是每小節 4 拍"]);
  });
  it("完全正確 → 沒有警告", () => expect(validateAbc(BEE)).toMatchObject({ ok: true, warnings: [] }));
});
