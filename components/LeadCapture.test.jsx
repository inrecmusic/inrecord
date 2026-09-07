// @vitest-environment jsdom
// 首頁「留下 Email 換試看」：沒勾同意送不出；成功 → 打 API、顯示已寄出、送 Lead 事件；試看信沒寄成要提示；失敗可重試。
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("@/lib/track-event", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/attribution", () => ({ readAttributionCookie: () => ({ utm_source: "ig" }) }));

import LeadCapture, { LeadForm } from "./LeadCapture";
import { trackEvent } from "@/lib/track-event";

afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); global.fetch = vi.fn(); });

const fill = (email) => fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
const submit = () => fireEvent.click(screen.getByRole("button", { name: /寄試看/ }));

describe("LeadForm（共用表單）", () => {
  it("沒勾同意 → 不打 API，提示先勾選", async () => {
    render(<LeadForm />);
    fill("a@x.com"); submit();
    expect(await screen.findByText(/請先勾選同意/)).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("Email 格式不對 → 不打 API，提示", async () => {
    render(<LeadForm />);
    fill("nope"); fireEvent.click(screen.getByRole("checkbox")); submit();
    expect(await screen.findByText(/格式/)).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("成功：POST email／consent／attribution，顯示已寄到該信箱、送 Lead 事件、呼叫 onDone", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, trialSent: true }) });
    const onDone = vi.fn();
    render(<LeadForm onDone={onDone} />);
    fill(" a@x.com "); fireEvent.click(screen.getByRole("checkbox")); submit();
    expect(await screen.findByText(/試看連結已寄到 a@x.com/)).toBeTruthy();
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/newsletter/subscribe");
    expect(JSON.parse(init.body)).toEqual({ email: "a@x.com", consent: true, attribution: { utm_source: "ig" } });
    expect(trackEvent).toHaveBeenCalledWith("Lead", expect.objectContaining({ contentName: "trial" }));
    expect(onDone).toHaveBeenCalledWith("a@x.com");
    expect(screen.queryByRole("button", { name: /寄試看/ })).toBeNull();
  });

  it("名單進了但試看信沒寄成 → 顯示補寄提示，不當成功寄出", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, trialSent: false }) });
    render(<LeadForm />);
    fill("a@x.com"); fireEvent.click(screen.getByRole("checkbox")); submit();
    expect(await screen.findByText(/試看信暫時沒寄成/)).toBeTruthy();
    expect(trackEvent).toHaveBeenCalled();
  });

  it("API 失敗 → 顯示錯誤、不送事件、表單留著可重試", async () => {
    global.fetch.mockResolvedValue({ ok: false, json: async () => ({ ok: false, error: "brevo_500" }) });
    render(<LeadForm />);
    fill("a@x.com"); fireEvent.click(screen.getByRole("checkbox")); submit();
    expect(await screen.findByText(/暫時無法送出/)).toBeTruthy();
    expect(trackEvent).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /寄試看/ })).toBeTruthy();
  });
});

describe("LeadCapture（首頁深色橫幅）", () => {
  it("渲染標題、表單與同意勾選", () => {
    render(<LeadCapture />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toMatch(/免費看一堂/);
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByRole("checkbox")).toBeTruthy();
  });
});
