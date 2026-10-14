// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("./shared", () => ({ F: "sans-serif", freshToken: async (t) => t }));

import RatingForm from "./RatingForm";

const NOW = Date.parse("2026-10-11T07:05:00Z");
const row = (over = {}) => ({ id: "r1", score: 5, content: null, created_at: "2026-10-11T07:05:00Z", ...over });
const ok = (data) => ({ ok: true, json: async () => ({ ok: true, data }) });
const fail = (error) => ({ ok: false, json: async () => ({ error }) });
const star = (n) => screen.getByRole("button", { name: `${n} 星` });
const call = (i) => { const [url, init] = global.fetch.mock.calls[i]; return { url, method: init.method, body: JSON.parse(init.body), auth: init.headers.Authorization }; };

beforeEach(() => { global.fetch = vi.fn(); vi.spyOn(Date, "now").mockReturnValue(NOW); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("RatingForm（點星即存，再問要不要寫一句）", () => {
  it("一開始只有星星，沒有心得欄", () => {
    render(<RatingForm token="tok" />);
    expect(star(5)).toBeTruthy();
    expect(screen.queryByPlaceholderText(/心得/)).toBeNull();
  });

  it("點 5 星 → 立刻 POST 只帶星數、通知 onRated，接著出現心得欄", async () => {
    global.fetch.mockResolvedValue(ok(row()));
    const onRated = vi.fn(); const onDone = vi.fn();
    render(<RatingForm token="tok" onRated={onRated} onDone={onDone} />);
    fireEvent.click(star(5));
    await waitFor(() => expect(screen.getByText("願意多寫一句心得嗎？")).toBeTruthy());
    expect(call(0)).toEqual({ url: "/api/classroom/rating", method: "POST", body: { score: 5 }, auth: "Bearer tok" });
    expect(onRated).toHaveBeenCalledWith(row());
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByText(/已記下你的 5 星/)).toBeTruthy();
  });

  it("寫心得按「送出心得」→ PATCH content、通知 onRated 與 onDone", async () => {
    global.fetch.mockResolvedValueOnce(ok(row())).mockResolvedValueOnce(ok(row({ content: "很棒" })));
    const onRated = vi.fn(); const onDone = vi.fn();
    render(<RatingForm token="tok" onRated={onRated} onDone={onDone} />);
    fireEvent.click(star(5));
    const box = await screen.findByPlaceholderText(/心得/);
    fireEvent.change(box, { target: { value: "很棒" } });
    fireEvent.click(screen.getByRole("button", { name: "送出心得" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(call(1)).toMatchObject({ url: "/api/classroom/rating", method: "PATCH", body: { content: "很棒" } });
    expect(onRated).toHaveBeenLastCalledWith(row({ content: "很棒" }));
  });

  it("按「跳過」→ 不再打 API，直接 onDone", async () => {
    global.fetch.mockResolvedValue(ok(row()));
    const onDone = vi.fn();
    render(<RatingForm token="tok" onDone={onDone} />);
    fireEvent.click(star(4));
    fireEvent.click(await screen.findByRole("button", { name: "跳過" }));
    expect(onDone).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("心得空白按「送出心得」→ 提示先寫、不打 API", async () => {
    global.fetch.mockResolvedValue(ok(row()));
    const onDone = vi.fn();
    render(<RatingForm token="tok" onDone={onDone} />);
    fireEvent.click(star(5));
    fireEvent.click(await screen.findByRole("button", { name: "送出心得" }));
    expect(screen.getByText("寫一句再送出，或按「跳過」")).toBeTruthy();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("存好之後再點別顆星 → PATCH 改星數", async () => {
    global.fetch.mockResolvedValueOnce(ok(row({ score: 2 }))).mockResolvedValueOnce(ok(row({ score: 5 })));
    render(<RatingForm token="tok" />);
    fireEvent.click(star(2));
    await screen.findByText(/已記下你的 2 星/);
    fireEvent.click(star(5));
    await waitFor(() => expect(screen.getByText(/已記下你的 5 星/)).toBeTruthy());
    expect(call(1)).toMatchObject({ method: "PATCH", body: { score: 5 } });
  });

  it("POST 回 already_rated（別的裝置評過了）→ 視為完成", async () => {
    global.fetch.mockResolvedValue(fail("already_rated"));
    const onDone = vi.fn();
    render(<RatingForm token="tok" onDone={onDone} />);
    fireEvent.click(star(3));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("POST 失敗 → 顯示訊息、星星不亮、不進下一步", async () => {
    global.fetch.mockResolvedValue(fail("forbidden"));
    const onRated = vi.fn();
    render(<RatingForm token="tok" onRated={onRated} />);
    fireEvent.click(star(5));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/送出失敗/));
    expect(onRated).not.toHaveBeenCalled();
    expect(screen.queryByText("願意多寫一句心得嗎？")).toBeNull();
  });

  it("existing（已評分、心得空白）→ 直接顯示補寫心得", () => {
    render(<RatingForm token="tok" existing={row({ score: 4 })} />);
    expect(screen.getByText(/已記下你的 4 星/)).toBeTruthy();
    expect(screen.getByPlaceholderText(/心得/)).toBeTruthy();
  });

  it("existing 超過 15 分鐘 → 星星不能再改（點了不打 API），仍可補心得", async () => {
    global.fetch.mockResolvedValue(ok(row({ score: 4, content: "補上了", created_at: "2026-10-01T00:00:00Z" })));
    const onDone = vi.fn();
    render(<RatingForm token="tok" existing={row({ score: 4, created_at: "2026-10-01T00:00:00Z" })} onDone={onDone} />);
    expect(star(5).disabled).toBe(true);
    fireEvent.click(star(5));
    expect(global.fetch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText(/心得/), { target: { value: "補上了" } });
    fireEvent.click(screen.getByRole("button", { name: "送出心得" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(call(0)).toMatchObject({ method: "PATCH", body: { content: "補上了" } });
  });
});
