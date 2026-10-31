// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { parseMusicXml } from "@/lib/score/musicxml";
import JianpuView from "./JianpuView";

const model = parseMusicXml(readFileSync(`${process.cwd()}/lib/score/fixtures/twinkle-grand.musicxml`, "utf8"));
afterEach(cleanup);

describe("JianpuView 點按（第二批）", () => {
  it("點音符、和弦、小節號分別通知上層；游標跟著 cursorBus 移動、播完隱藏", () => {
    const onNoteClick = vi.fn(), onChordClick = vi.fn(), onBarClick = vi.fn();
    let emit = null;
    const bus = { subscribe: (fn) => ((emit = fn), () => {}) };
    const { container } = render(
      <JianpuView model={model} width={900} showChords cursorBus={bus} loop={{ from: 1, to: 2 }}
        onNoteClick={onNoteClick} onChordClick={onChordClick} onBarClick={onBarClick} />,
    );
    fireEvent.click(container.querySelector("[data-id] text"));
    expect(onNoteClick).toHaveBeenCalledWith(model.notes.find((n) => !n.rest && n.staff === 1)?.id ?? expect.any(String));
    fireEvent.click(container.querySelector("[data-chord] text"));
    expect(onChordClick).toHaveBeenCalledWith(model.chords[0].id);
    fireEvent.click(container.querySelector('[data-barno="2"]'));
    expect(onBarClick).toHaveBeenCalledWith(2);
    expect(container.querySelectorAll("rect.sv2-band")).toHaveLength(2);
    const cur = container.querySelector("rect.sv2-cur");
    emit({ measure: 1, pos: 0, beat: 1 });
    expect(cur.getAttribute("visibility")).toBe("visible");
    emit(null);
    expect(cur.getAttribute("visibility")).toBe("hidden");
  });
});
