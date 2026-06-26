// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import Countdown from "./Countdown.jsx";

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Countdown", () => {
  it("倒數歸零後清除計時器（不無限空轉）", () => {
    vi.useFakeTimers();
    const start = new Date("2026-06-26T00:00:00.000Z").getTime();
    vi.setSystemTime(start);
    const to = new Date(start + 2000).toISOString(); // 2 秒後到期

    const { container } = render(<Countdown to={to} />);
    expect(vi.getTimerCount()).toBe(1);          // interval 啟動中
    expect(container.textContent).toMatch(/秒/);  // 倒數顯示中

    act(() => { vi.advanceTimersByTime(3000); }); // 越過到期
    expect(container.textContent).toBe("");        // 過期 → 不顯示
    expect(vi.getTimerCount()).toBe(0);            // ★ 計時器已清除
  });

  it("一開始就過期的 to → 不啟動計時器、不顯示", () => {
    vi.useFakeTimers();
    const start = new Date("2026-06-26T00:00:00.000Z").getTime();
    vi.setSystemTime(start);
    const to = new Date(start - 1000).toISOString(); // 已過期

    const { container } = render(<Countdown to={to} />);
    expect(container.textContent).toBe("");
    expect(vi.getTimerCount()).toBe(0);
  });
});
