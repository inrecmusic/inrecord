import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { DOMParser } from "@xmldom/xmldom";
import { parseMusicXml } from "./musicxml.js";
import { renderGrandJianpu } from "./jianpu-grand.js";

const fx = (name) => parseMusicXml(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const bee = fx("twinkle-grand.musicxml");
const st = fx("stress.musicxml");
const O = { width: 960, chordMode: "name", showChords: true, rightHandOnly: false };
const dom = (svg) => new DOMParser().parseFromString(svg, "image/svg+xml");
const noteG = (svg, id) => {
  const gs = dom(svg).getElementsByTagName("g");
  for (let i = 0; i < gs.length; i++) if (gs[i].getAttribute("data-id") === id) return gs[i];
  return null;
};
const digitPos = (svg, id) => {
  const t = noteG(svg, id).getElementsByTagName("text");
  for (let i = 0; i < t.length; i++) if (t[i].getAttribute("class") === "jp-num") return { x: +t[i].getAttribute("x"), y: +t[i].getAttribute("y") };
  return null;
};

describe("renderGrandJianpu", () => {
  const out = renderGrandJianpu(bee, O);

  it("每個音符（含休止）都有 data-id", () => {
    for (const n of bee.notes) expect(out.svg).toContain(`data-id="${n.id}"`);
    const s = renderGrandJianpu(st, O).svg;
    for (const n of st.notes.filter((n) => n.rest)) expect(s).toContain(`data-id="${n.id}"`);
  });

  it("輸出是合法的 SVG", () => {
    expect(dom(out.svg).documentElement.nodeName).toBe("svg");
    expect(out.height).toBeGreaterThan(0);
  });

  it("左手和弦上下堆疊（x 相同、y 不同，高音在上）", () => {
    const lh = bee.notes.filter((n) => n.measure === 0 && n.staff === 2 && n.onset === 0); // midi 由低到高
    const pos = lh.map((n) => digitPos(out.svg, n.id));
    expect(new Set(pos.map((p) => p.x)).size).toBe(1);
    expect(new Set(pos.map((p) => p.y)).size).toBe(3);
    expect(pos[2].y).toBeLessThan(pos[0].y);
  });

  it("右手在上、左手在下，同一拍對齊", () => {
    const rh = digitPos(out.svg, "n0");
    const lh = digitPos(out.svg, bee.notes.find((n) => n.measure === 0 && n.staff === 2).id);
    expect(rh.y).toBeLessThan(lh.y);
    expect(rh.x).toBe(lh.x);
  });

  it("只看右手：不含任何左手 id", () => {
    const s = renderGrandJianpu(bee, { ...O, rightHandOnly: true });
    for (const n of bee.notes.filter((n) => n.staff === 2)) expect(s.svg).not.toContain(`data-id="${n.id}"`);
    expect(s.height).toBeLessThan(out.height);
  });

  it("關掉和弦或沒有和弦：沒有 jp-chord，也不留空白列", () => {
    expect(out.svg).toContain('class="jp-chord"');
    expect(out.svg).toContain('data-chord="c0"');
    const off = renderGrandJianpu(bee, { ...O, showChords: false });
    expect(off.svg).not.toContain("jp-chord");
    expect(off.height).toBeLessThan(out.height);
    const none = renderGrandJianpu({ ...bee, chords: [], hasChords: false }, O);
    expect(none.svg).not.toContain("jp-chord");
    expect(none.height).toBe(off.height);
  });

  it("和弦標示模式", () => {
    const roman = renderGrandJianpu(bee, { ...O, chordMode: "roman" }).svg;
    expect(roman).toContain("V7");
    expect(roman).not.toContain(">G7<");
    const both = renderGrandJianpu(bee, { ...O, chordMode: "both" }).svg;
    expect(both).toContain("G7");
    expect(both).toContain("V7");
  });

  it("調號、轉調、變拍", () => {
    const s = renderGrandJianpu(st, O).svg;
    expect(s).toContain("1=G");
    expect(s).toContain("1=F");
    expect(s).toContain("3/4");
    expect(s).toContain("6/8");
  });

  it("三連音畫一個 3", () => {
    expect(renderGrandJianpu(st, O).svg).toMatch(/class="jp-tuplet"[^>]*>3</);
  });

  it("窄螢幕每行小節數較少", () => {
    const rowsOf = (w) => renderGrandJianpu(bee, { ...O, width: w }).rows;
    expect(rowsOf(320)).toBeGreaterThan(rowsOf(960));
  });

  it("文字一律跳脫", () => {
    const evil = { ...bee, title: '<b>"x"', chords: bee.chords.map((c, i) => (i ? c : { ...c, name: "<script>" })) };
    const s = renderGrandJianpu(evil, O).svg;
    expect(s).not.toContain("<script");
    expect(s).not.toContain("<b>");
    expect(s).toContain("&lt;script&gt;");
  });

  it("多聲部小節只畫第一聲部", () => {
    const s = renderGrandJianpu(st, O).svg;
    const v2 = st.notes.filter((n) => n.measure === 11 && n.voice === "2");
    expect(v2.length).toBe(4);
    for (const n of v2) expect(s).not.toContain(`data-id="${n.id}"`);
  });
});

describe("renderGrandJianpu 節奏斜線（Lead Sheet）", () => {
  it("只看右手且開斜線：每拍一條斜線（4/4 八小節 32 條）", () => {
    const s = renderGrandJianpu(bee, { ...O, rightHandOnly: true, slashes: true }).svg;
    expect((s.match(/class="jp-slash"/g) || []).length).toBe(32);
  });
  it("6/8 每附點四分一條；弱起只畫實際拍數", () => {
    const s = renderGrandJianpu(st, { ...O, rightHandOnly: true, slashes: true }).svg;
    // 0 弱起 1 拍＋4/4×4（1–4）＋3/4×2（5–6）＋6/8×1（7：2 條）＋4/4×5（8–12）
    expect((s.match(/class="jp-slash"/g) || []).length).toBe(1 + 16 + 6 + 2 + 20);
  });
  it("顯示左手時或關掉時不畫", () => {
    expect(renderGrandJianpu(bee, { ...O, rightHandOnly: false, slashes: true }).svg).not.toContain("jp-slash");
    expect(renderGrandJianpu(bee, { ...O, rightHandOnly: true, slashes: false }).svg).not.toContain("jp-slash");
  });
});
