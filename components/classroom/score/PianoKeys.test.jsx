// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import PianoKeys from "./PianoKeys";

afterEach(cleanup);
const key = (container, m) => container.querySelector(`[data-m="${m}"]`);

describe("PianoKeys", () => {
  it("畫出 low–high 的琴鍵", () => {
    const { container } = render(<PianoKeys low={36} high={84} onNote={() => {}} />);
    expect(container.querySelectorAll("[data-m]").length).toBe(49);
  });

  it("組和弦：點 C4、E4、G4 → 顯示 C；清除 → 名稱消失", () => {
    const onNote = vi.fn();
    const { container } = render(<PianoKeys low={36} high={84} onNote={onNote} />);
    fireEvent.click(screen.getByRole("button", { name: /用滑鼠點選組和弦/ }));
    for (const m of [60, 64, 67]) fireEvent.pointerDown(key(container, m));
    expect(onNote).toHaveBeenCalledTimes(3);
    expect(container.querySelector(".pk-big").textContent).toBe("C");
    fireEvent.click(screen.getByRole("button", { name: /清除/ }));
    expect(container.querySelector(".pk-big").textContent).toBe("—");
  });

  it("電腦鍵盤 q 彈 C4；焦點在輸入框時不觸發", () => {
    const onNote = vi.fn();
    render(
      <div>
        <input aria-label="x" />
        <PianoKeys low={36} high={84} onNote={onNote} />
      </div>,
    );
    fireEvent.keyDown(window, { key: "q" });
    expect(onNote).toHaveBeenCalledWith(60);
    onNote.mockClear();
    fireEvent.keyDown(screen.getByLabelText("x"), { key: "q" });
    expect(onNote).not.toHaveBeenCalled();
  });

  it("播放中的音亮鍵", () => {
    const { container } = render(<PianoKeys low={36} high={84} activeMidis={new Set([67])} onNote={() => {}} />);
    expect(key(container, 67).classList.contains("is-now")).toBe(true);
    expect(key(container, 60).classList.contains("is-now")).toBe(false);
  });
});
