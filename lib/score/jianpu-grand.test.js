import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { DOMParser } from "@xmldom/xmldom";
import { parseMusicXml } from "./musicxml.js";
import { renderGrandJianpu } from "./jianpu-grand.js";

const fx = (name) => parseMusicXml(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const bee = fx("twinkle-grand.musicxml");
const st = fx("stress.musicxml");
const mel = fx("twinkle-melody.musicxml");
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

  it("轉調、變拍才標（開頭調號拍號已在樂譜標題列，不重複）", () => {
    const s = renderGrandJianpu(st, O).svg;
    expect(s).not.toContain("1=G");
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

describe("renderGrandJianpu 節奏斜線（Lead Sheet，照左手節奏）", () => {
  const count = (svg) => (svg.match(/class="jp-slash"/g) || []).length;
  const lhOnsets = (m) => new Set(m.notes.filter((n) => n.staff === 2 && !n.rest && !n.tieStop).map((n) => `${n.measure}|${n.onset}`)).size;
  it("原譜左手：每個左手起音一個斜線（小蜜蜂雙手版每小節兩個二分音符＝16 個，空心）", () => {
    const s = renderGrandJianpu(bee, { ...O, rightHandOnly: true, slashes: true }).svg;
    expect(count(s)).toBe(16);
    expect(s).toContain('fill="none"');
  });
  it("自動伴奏 8-3 經典波浪：每拍一個實心斜線，帶符桿", async () => {
    const { withAccompaniment } = await import("./accompaniment.js");
    const m = withAccompaniment(mel, "wave");
    const s = renderGrandJianpu(m, { ...O, rightHandOnly: true, slashes: true }).svg;
    expect(count(s)).toBe(lhOnsets(m));
    expect(s).not.toContain('fill="none"');
  });
  it("壓力檔：斜線數＝左手起音數（和弦音只算一個、連結線後半不算）", () => {
    const s = renderGrandJianpu(st, { ...O, rightHandOnly: true, slashes: true }).svg;
    expect(count(s)).toBe(lhOnsets(st));
  });
  it("顯示左手時、關掉時、沒有左手時都不畫", () => {
    expect(renderGrandJianpu(bee, { ...O, rightHandOnly: false, slashes: true }).svg).not.toContain("jp-slash");
    expect(renderGrandJianpu(bee, { ...O, rightHandOnly: true, slashes: false }).svg).not.toContain("jp-slash");
    expect(renderGrandJianpu(mel, { ...O, rightHandOnly: true, slashes: true }).svg).not.toContain("jp-slash");
  });
});

describe("小節號、列名、小節位置（第二批）", () => {
  it("每小節一個可點的小節號；每行開頭寫右／左，只看右手開斜線時寫節奏", () => {
    const { svg, bars, rows } = renderGrandJianpu(bee, O);
    expect((svg.match(/data-barno="/g) || []).length).toBe(bee.measures.length);
    expect((svg.match(/>右<\/text>/g) || []).length).toBe(rows);
    expect((svg.match(/>左<\/text>/g) || []).length).toBe(rows);
    expect(bars).toHaveLength(bee.measures.length);
    const b = bars[1];
    expect(b.x1).toBeGreaterThan(b.x0);
    expect(b.bottom).toBeGreaterThan(b.top);
    expect(b.xAt(0)).toBeGreaterThanOrEqual(b.x0);
    expect(b.xAt(1)).toBeGreaterThan(b.xAt(0));
    const lead = renderGrandJianpu(bee, { ...O, rightHandOnly: true, slashes: true }).svg;
    expect(lead).toContain(">節奏</text>");
    expect(lead).not.toContain(">左</text>");
  });
});
