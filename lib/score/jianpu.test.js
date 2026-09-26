import { describe, it, expect } from "vitest";
import { parseAbc } from "./abc.js";
import { renderJianpu, beamCount, dashCount, isDotted, groupByBeat } from "./jianpu.js";

const model = parseAbc(`X:1
T:小蜜蜂
M:2/4
L:1/8
K:C
"C" G2 E E | "G7" F2 D D | "C" C D E F | "C" G2 z2 |`);

describe("時值 → 簡譜符號", () => {
  it("底線數：一拍 0 條、半拍 1 條、四分之一拍 2 條", () => {
    expect([beamCount(1), beamCount(0.5), beamCount(0.25), beamCount(2)]).toEqual([0, 1, 2, 0]);
  });
  it("延長線：兩拍 1 條、四拍 3 條", () => {
    expect([dashCount(1), dashCount(2), dashCount(4)]).toEqual([0, 1, 3]);
  });
  it("附點：1.5／0.75 拍是附點；1、2 拍與三拍不是（三拍用延長線）", () => {
    expect([isDotted(1.5), isDotted(0.75), isDotted(1), isDotted(2), isDotted(3)]).toEqual([true, true, false, false, false]);
  });
});

describe("groupByBeat（同一拍的短音符共用底線）", () => {
  const n = (beats) => ({ beats, rest: false });
  it("兩個八分音符在同一拍 → 一組", () => {
    expect(groupByBeat([n(0.5), n(0.5)]).map((g) => g.length)).toEqual([2]);
  });
  it("跨拍不連在一起", () => {
    expect(groupByBeat([n(0.5), n(0.5), n(0.5), n(0.5)]).map((g) => g.length)).toEqual([2, 2]);
  });
  it("一拍以上的音符自成一組", () => {
    expect(groupByBeat([n(1), n(0.5), n(0.5)]).map((g) => g.length)).toEqual([1, 2]);
  });
});

describe("renderJianpu", () => {
  const { svg, height } = renderJianpu(model, { width: 760 });

  it("輸出合法 SVG 並標出調號與拍號", () => {
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("1=C　2/4");
    expect(height).toBeGreaterThan(80);
  });
  it("每個音符包一層 data-idx，與播放編號一致；休止是 -1", () => {
    const ids = [...svg.matchAll(/data-idx="(-?\d+)"/g)].map((m) => Number(m[1]));
    expect(ids.filter((i) => i >= 0)).toEqual([...Array(model.noteCount).keys()]);
    expect(ids).toContain(-1); // 最後一小節的 z2
  });
  it("畫出唱名數字與休止 0", () => {
    const nums = [...svg.matchAll(/font-weight="600"[^>]*>(\d)</g)].map((m) => m[1]);
    expect(nums.slice(0, 4)).toEqual(["5", "3", "3", "4"]);
    expect(nums).toContain("0");
  });
  it("和弦預設顯示、關掉就不出現", () => {
    expect(svg).toContain(">G7<");
    expect(renderJianpu(model, { showChords: false }).svg).not.toContain(">G7<");
  });
  it("半拍音符有底線、整拍沒有", () => {
    expect((svg.match(/<line[^>]*stroke-width="1.4"/g) || []).length).toBeGreaterThan(0);
  });
  it("高八度在上方加點、低八度在下方加點", () => {
    const m2 = parseAbc("X:1\nM:4/4\nL:1/4\nK:C\nc C, |");
    const s2 = renderJianpu(m2, { width: 400 }).svg;
    expect((s2.match(/<circle/g) || []).length).toBe(2);
  });
  it("手機寬度自動改成每行 2 小節（高度變高）", () => {
    expect(renderJianpu(model, { width: 390 }).height).toBeGreaterThan(height);
  });
  it("最後一小節畫雙縱線收尾", () => {
    expect(svg).toContain('stroke-width="2.6"');
  });
  it("跳脫和弦文字裡的特殊字元", () => {
    const bad = parseAbc('X:1\nM:4/4\nL:1/4\nK:C\n"C<script>" C |');
    expect(renderJianpu(bad).svg).not.toContain("<script>");
  });
  it("空模型不會爆", () => expect(renderJianpu({ measures: [] })).toEqual({ svg: "", height: 0 }));

  const beams = (abc, width = 820) => {
    const s = renderJianpu(parseAbc(abc), { width }).svg;
    return [...s.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)"[^>]*stroke-width="1.4"/g)]
      .map((m) => ({ y: Math.round(+m[2]), x1: Math.round(+m[1]), x2: Math.round(+m[3]) }));
  };

  it("附點八分＋十六分：一條長底線＋十六分自己多一條短的", () => {
    const b = beams("X:1\nM:4/4\nL:1/8\nK:C\nC3/2 D/ E2 |");
    expect(b.length).toBe(2);
    expect(b[1].y).toBeGreaterThan(b[0].y);      // 第二條在下面
    expect(b[1].x1).toBeGreaterThan(b[0].x1);    // 只從十六分那個音符開始
    expect(b[1].x2).toBe(b[0].x2);               // 兩條同時結束
  });
  it("四個三十二分音符：三條底線都橫跨整組", () => {
    const b = beams("X:1\nM:4/4\nL:1/8\nK:C\nC/// D/// E/// F/// G2 z |");
    const group = b.filter((x) => x.x1 === b[0].x1);
    expect(group.length).toBe(3);
    expect(new Set(group.map((x) => x.x2)).size).toBe(1);
  });
  it("音符再多也不會壓到小節線", () => {
    const abc = "X:1\nM:4/4\nL:1/8\nK:C\nC C C C C C C C | C8 |";
    const svg = renderJianpu(parseAbc(abc), { width: 720 }).svg;
    const xs = [...svg.matchAll(/<text x="([\d.]+)"[^>]*font-size="22"/g)].map((m) => +m[1]);
    const bars = [...svg.matchAll(/<line x1="([\d.]+)"[^>]*stroke-width="1.1"/g)].map((m) => +m[1]);
    const firstBar = Math.min(...bars);
    expect(Math.max(...xs.filter((x) => x < firstBar))).toBeLessThan(firstBar - 8);
  });
  it("一小節音符太多時，每行自動少放幾小節", () => {
    const dense = "X:1\nM:4/4\nL:1/8\nK:C\n" + Array(8).fill("C C C C C C C C |").join("");
    const sparse = "X:1\nM:4/4\nL:1/4\nK:C\n" + Array(8).fill("C4 |").join("");
    expect(renderJianpu(parseAbc(dense), { width: 760 }).height)
      .toBeGreaterThan(renderJianpu(parseAbc(sparse), { width: 760 }).height);
  });
});
