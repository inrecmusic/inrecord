// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("./shared", () => ({ F: "sans-serif", freshToken: async (t) => t }));

import RatingForm from "./RatingForm";

beforeEach(() => { global.fetch = vi.fn(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("RatingForm", () => {
  it("沒選星星送出鈕 disabled；選 5 星後送出打 /api/classroom/rating 並呼叫 onDone", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const onDone = vi.fn();
    render(<RatingForm token="tok" onDone={onDone} />);
    const submit = screen.getByRole("button", { name: "送出評分" });
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getAllByRole("button", { name: /星/ })[4]);
    fireEvent.change(screen.getByPlaceholderText("分享你的學習心得（選填）"), { target: { value: "很棒" } });
    fireEvent.click(submit);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/classroom/rating");
    expect(JSON.parse(init.body)).toEqual({ score: 5, content: "很棒" });
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("API 回 already_rated 也算完成（呼叫 onDone）", async () => {
    global.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: "already_rated" }) });
    const onDone = vi.fn();
    render(<RatingForm token="tok" onDone={onDone} />);
    fireEvent.click(screen.getAllByRole("button", { name: /星/ })[2]);
    fireEvent.click(screen.getByRole("button", { name: "送出評分" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("其他錯誤顯示訊息、不呼叫 onDone", async () => {
    global.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: "not_purchased" }) });
    const onDone = vi.fn();
    render(<RatingForm token="tok" onDone={onDone} />);
    fireEvent.click(screen.getAllByRole("button", { name: /星/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: "送出評分" }));
    await waitFor(() => expect(screen.getByText("not_purchased")).toBeTruthy());
    expect(onDone).not.toHaveBeenCalled();
  });
});
