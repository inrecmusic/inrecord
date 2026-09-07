// @vitest-environment jsdom
// 首頁「留下 Email」：沒勾同意送不出；成功 → 打 API、顯示完成、送 Lead 事件；失敗 → 提示且可重試。
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("@/lib/track-event", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/attribution", () => ({ readAttributionCookie: () => ({ utm_source: "ig" }) }));

import LeadCapture from "./LeadCapture";
import { trackEvent } from "@/lib/track-event";

afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); global.fetch = vi.fn(); });

const fill = (email) => fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
const submit = () => fireEvent.click(screen.getByRole("button", { name: /通知我/ }));

describe("LeadCapture（首頁留信箱）", () => {
  it("沒勾同意 → 不打 API，提示先勾選", async () => {
    render(<LeadCapture />);
    fill("a@x.com"); submit();
    expect(await screen.findByText(/請先勾選同意/)).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("Email 格式不對 → 不打 API，提示", async () => {
    render(<LeadCapture />);
    fill("nope"); fireEvent.click(screen.getByRole("checkbox")); submit();
    expect(await screen.findByText(/格式/)).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("成功：POST email／consent／attribution，顯示完成並送 Lead 事件", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(<LeadCapture />);
    fill(" a@x.com "); fireEvent.click(screen.getByRole("checkbox")); submit();
    expect(await screen.findByText(/已訂閱/)).toBeTruthy();
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/newsletter/subscribe");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ email: "a@x.com", consent: true, attribution: { utm_source: "ig" } });
    expect(trackEvent).toHaveBeenCalledWith("Lead", expect.objectContaining({ contentName: "newsletter" }));
    expect(screen.queryByRole("button", { name: /通知我/ })).toBeNull();
  });

  it("API 失敗 → 顯示錯誤、不送事件、表單留著可重試", async () => {
    global.fetch.mockResolvedValue({ ok: false, json: async () => ({ ok: false, error: "brevo_500" }) });
    render(<LeadCapture />);
    fill("a@x.com"); fireEvent.click(screen.getByRole("checkbox")); submit();
    expect(await screen.findByText(/暫時無法送出/)).toBeTruthy();
    expect(trackEvent).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /通知我/ })).toBeTruthy();
  });
});
