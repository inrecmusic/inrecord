// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("./shared", () => ({ F: "sans-serif", freshToken: async (t) => t }));

import RatingTab from "./RatingTab";

const row = (over = {}) => ({ id: "r1", score: 4, content: null, created_at: "2026-10-01T00:00:00Z", ...over });

beforeEach(() => { global.fetch = vi.fn(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("RatingTab（播放頁「課程評價」分頁）", () => {
  it("還沒評分 → 顯示星星表單", () => {
    render(<RatingTab token="tok" rating={null} />);
    expect(screen.getByText("你對這堂課的評分是？")).toBeTruthy();
    expect(screen.getByRole("button", { name: "5 星" })).toBeTruthy();
  });

  it("評過但心得空白 → 可以補寫", () => {
    render(<RatingTab token="tok" rating={row()} />);
    expect(screen.getByText(/已記下你的 4 星/)).toBeTruthy();
    expect(screen.getByPlaceholderText(/心得/)).toBeTruthy();
  });

  it("評過且已有心得 → 只顯示感謝，沒有表單", () => {
    render(<RatingTab token="tok" rating={row({ content: "很棒" })} />);
    expect(screen.getByText("感謝你的評價！")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "5 星" })).toBeNull();
  });

  it("補寫送出 → 把新的評價往上通知（onRated），並顯示感謝", async () => {
    const after = row({ content: "補上了" });
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: after }) });
    const onRated = vi.fn();
    render(<RatingTab token="tok" rating={row()} onRated={onRated} />);
    fireEvent.change(screen.getByPlaceholderText(/心得/), { target: { value: "補上了" } });
    fireEvent.click(screen.getByRole("button", { name: "送出心得" }));
    await waitFor(() => expect(screen.getByText("感謝你的評價！")).toBeTruthy());
    expect(onRated).toHaveBeenCalledWith(after);
  });
});
