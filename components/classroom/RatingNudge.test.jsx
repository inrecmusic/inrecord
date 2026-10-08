// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("./shared", () => ({ F: "sans-serif", freshToken: async (t) => t }));

import RatingNudge from "./RatingNudge";

const chapters = [{ id: "c1", sort_order: 0 }];
const videos = [{ id: "v1", chapter_id: "c1", title: "1-1" }];
const doneAll = [{ video_id: "v1", completed: true }];
const props = { token: "tok", rated: false, chapters, videos, progress: doneAll };

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

describe("RatingNudge（看完第 1 章後的評分邀請）", () => {
  it("條件成立顯示卡片與表單", async () => {
    render(<RatingNudge {...props} />);
    await waitFor(() => expect(screen.getByText("看完第 1 章了，給這堂課一個評分吧")).toBeTruthy());
    expect(screen.getByRole("button", { name: "送出評分" })).toBeTruthy();
  });
  it("已評分不顯示", () => {
    const { container } = render(<RatingNudge {...props} rated={true} />);
    expect(container.innerHTML).toBe("");
  });
  it("按「先不用」→ 收起並寫 localStorage，下次 mount 不再顯示", async () => {
    const { container, unmount } = render(<RatingNudge {...props} />);
    await waitFor(() => screen.getByText("先不用"));
    fireEvent.click(screen.getByText("先不用"));
    expect(container.innerHTML).toBe("");
    expect(window.localStorage.getItem("inrec_rating_nudge_dismissed")).toBe("1");
    unmount();
    const r2 = render(<RatingNudge {...props} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(r2.container.innerHTML).toBe("");
  });
  it("送出成功 → 顯示感謝並寫 localStorage", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(<RatingNudge {...props} />);
    await waitFor(() => screen.getByRole("button", { name: "5 星" }));
    fireEvent.click(screen.getByRole("button", { name: "5 星" }));
    fireEvent.click(screen.getByRole("button", { name: "送出評分" }));
    await waitFor(() => expect(screen.getByText("感謝你的評價！")).toBeTruthy());
    expect(window.localStorage.getItem("inrec_rating_nudge_dismissed")).toBe("1");
  });
});
