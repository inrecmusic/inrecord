// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("./shared", () => ({ F: "sans-serif", freshToken: async (t) => t }));

import RatingPrompt from "./RatingPrompt";
import { localDay } from "@/lib/rating-prompt";

const TITLE = "願意留下您的課程評價嗎？";
const KEY = "inrec_rating_prompt";
const video = { id: "v1", title: "1-1 認識鍵盤" };
let n = 0;
const ended = (v = video, completed = true) => ({ video: v, completed, at: ++n }); // 每次播完都是新物件
const saved = () => JSON.parse(window.localStorage.getItem(KEY) || "null");
const row = { id: "r1", score: 5, content: null, created_at: new Date().toISOString() };

// 這版 jsdom 的 localStorage 沒有 clear()：每個 case 換一份記憶體 storage 掛到 window
function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
beforeEach(() => {
  Object.defineProperty(window, "localStorage", { value: memoryStorage(), configurable: true });
  global.fetch = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("RatingPrompt（播完一個單元跳出的評分邀請）", () => {
  it("還沒有單元播完 → 什麼都不顯示", () => {
    const { container } = render(<RatingPrompt token="tok" rated={false} ended={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("正課單元播完且未評分 → 跳出對話框，並記一次", async () => {
    render(<RatingPrompt token="tok" rated={false} ended={ended()} />);
    const dlg = await screen.findByRole("dialog");
    expect(dlg.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByText(TITLE)).toBeTruthy();
    expect(screen.getByRole("button", { name: "5 星" })).toBeTruthy();
    expect(saved()).toEqual({ total: 1, day: localDay(), dayCount: 1 });
  });

  it("已評分 → 不跳、不記次數", async () => {
    const { container } = render(<RatingPrompt token="tok" rated={true} ended={ended()} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container.innerHTML).toBe("");
    expect(saved()).toBeNull();
  });

  it("試看單元、或單元還沒達到完成 → 不跳", async () => {
    const { container, rerender } = render(<RatingPrompt token="tok" rated={false} ended={ended({ id: "t", title: "試看 開場" })} />);
    rerender(<RatingPrompt token="tok" rated={false} ended={ended(video, false)} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container.innerHTML).toBe("");
    expect(saved()).toBeNull();
  });

  it("按「先不用」關閉；同一天第 2 次還會跳、第 3 次不跳", async () => {
    const { container, rerender } = render(<RatingPrompt token="tok" rated={false} ended={ended()} />);
    fireEvent.click(await screen.findByRole("button", { name: "先不用" }));
    expect(container.innerHTML).toBe("");

    rerender(<RatingPrompt token="tok" rated={false} ended={ended()} />);
    fireEvent.click(await screen.findByRole("button", { name: "關閉" }));
    expect(container.innerHTML).toBe("");
    expect(saved()).toEqual({ total: 2, day: localDay(), dayCount: 2 });

    rerender(<RatingPrompt token="tok" rated={false} ended={ended()} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container.innerHTML).toBe("");
    expect(saved().total).toBe(2);
  });

  it("這台裝置已跳滿 3 次 → 不再跳", async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ total: 3, day: "2026-01-01", dayCount: 1 }));
    const { container } = render(<RatingPrompt token="tok" rated={false} ended={ended()} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container.innerHTML).toBe("");
  });

  it("按 Esc 關閉", async () => {
    const { container } = render(<RatingPrompt token="tok" rated={false} ended={ended()} />);
    await screen.findByRole("dialog");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.innerHTML).toBe("");
  });

  it("點星 → 通知 onRated、對話框留著問心得；rated 變 true 也不會被關掉；跳過 → 感謝 → 繼續上課關閉", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: row }) });
    const onRated = vi.fn();
    const e = ended();
    const { container, rerender } = render(<RatingPrompt token="tok" rated={false} ended={e} onRated={onRated} />);
    fireEvent.click(await screen.findByRole("button", { name: "5 星" }));
    await waitFor(() => expect(onRated).toHaveBeenCalledWith(row));
    rerender(<RatingPrompt token="tok" rated={true} ended={e} onRated={onRated} />);
    expect(screen.getByText("願意多寫一句心得嗎？")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "先不用" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "跳過" }));
    expect(screen.getByText("感謝你的評價！")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "繼續上課" }));
    expect(container.innerHTML).toBe("");
  });
});
