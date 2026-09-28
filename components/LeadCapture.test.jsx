// @vitest-environment jsdom
// 首頁「留下 Email 換試看」：沒勾同意送不出；成功 → 打 API、當場給觀看連結（不必去收信）、送 Lead 事件；
// 後端沒回 trialPath 時退回原本的「去信箱找」提示；失敗可重試。
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

vi.mock("@/lib/track-event", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/attribution", () => ({
  readAttributionCookie: () => ({ utm_source: "ig" }),
  readFbCookies: () => ({ fbp: "fb.1.100.abc", fbc: "fb.1.100.xyz" }),
}));

import LeadCapture, { LeadForm } from "./LeadCapture";
import { trackEvent } from "@/lib/track-event";

afterEach(cleanup);
// jsdom 沒有實作 location.assign（直接呼叫會丟 Not implemented），換成可觀測的 mock
let assign;
beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
  assign = vi.fn();
  Object.defineProperty(window, "location", { configurable: true, value: { assign, href: "http://localhost/" } });
});

const fill = (email) => fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
const submit = () => fireEvent.click(screen.getByRole("button", { name: /立即觀看試看/ }));
const TRIAL_PATH = "/trial?e=a%40x.com&t=abc123&utm_source=site&utm_medium=lead_form&utm_campaign=trial";
const watchLink = () => screen.queryByRole("link", { name: /立即觀看試看課程/ });

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

  it("成功：POST email／consent／attribution，當場給觀看連結、送 Lead 事件、呼叫 onDone", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, trialSent: true, trialPath: TRIAL_PATH }) });
    const onDone = vi.fn();
    render(<LeadForm onDone={onDone} />);
    fill(" a@x.com "); fireEvent.click(screen.getByRole("checkbox")); submit();
    expect(await screen.findByText(/試看已解鎖/)).toBeTruthy();
    // 關鍵：廣告點擊已經付過錢，不能只留一句「已寄到信箱」就把人丟在那裡
    expect(watchLink().getAttribute("href")).toBe(TRIAL_PATH);
    // 會自動跳走，不放只閃 0.5 秒的提示文字
    expect(screen.queryByText(/垃圾郵件|連結也寄到/)).toBeNull();
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/newsletter/subscribe");
    // fbp/fbc 一起送，Meta 的比對率才高；eventId 讓伺服器端 CAPI 與這裡的 fbq 去重
    const sent = JSON.parse(init.body);
    expect(sent).toEqual({
      email: "a@x.com", consent: true, attribution: { utm_source: "ig" },
      eventId: expect.any(String), fbp: "fb.1.100.abc", fbc: "fb.1.100.xyz",
    });
    expect(sent.eventId).toBeTruthy();
    expect(trackEvent).toHaveBeenCalledWith("Lead", expect.objectContaining({ contentName: "trial", eventId: sent.eventId }));
    expect(onDone).toHaveBeenCalledWith("a@x.com");
    expect(screen.queryByRole("button", { name: /立即觀看試看/ })).toBeNull();
  });

  it("試看信沒寄成但有 trialPath → 照樣給觀看連結並自動跳轉（信寄不寄成不影響看得到）", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, trialSent: false, trialPath: TRIAL_PATH }) });
    render(<LeadForm />);
    fill("a@x.com"); fireEvent.click(screen.getByRole("checkbox")); submit();
    expect(await screen.findByText(/試看已解鎖/)).toBeTruthy();
    expect(watchLink()).toBeTruthy();
    expect(trackEvent).toHaveBeenCalled();
    await waitFor(() => expect(assign).toHaveBeenCalledWith(TRIAL_PATH), { timeout: 3000 });
  });

  it("有 trialPath → 自動跳到試看頁（不用再按一次）", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, trialSent: true, trialPath: TRIAL_PATH }) });
    render(<LeadForm />);
    fill("a@x.com"); fireEvent.click(screen.getByRole("checkbox")); submit();
    await screen.findByText(/試看已解鎖/);
    // 廣告的優化目標是 /trial 那頁 PageView 觸發的自訂轉換，跳過去才算數，所以跳得越快越好；
    // 仍留緩衝讓首頁的 Lead 事件盡量送得出去。
    await waitFor(() => expect(assign).toHaveBeenCalledWith(TRIAL_PATH), { timeout: 3000 });
  });

  it("後端沒回 trialPath → 不自動跳轉，退回原本的「去信箱找」提示、不顯示觀看連結", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, trialSent: true }) });
    render(<LeadForm />);
    fill("a@x.com"); fireEvent.click(screen.getByRole("checkbox")); submit();
    expect(await screen.findByText(/試看連結已寄到 a@x.com/)).toBeTruthy();
    expect(screen.getByText(/垃圾郵件/)).toBeTruthy();
    expect(watchLink()).toBeNull();
    await new Promise((r) => setTimeout(r, 700)); // 過了跳轉緩衝也不該跳
    expect(assign).not.toHaveBeenCalled();
  });

  it("名單進了、信沒寄成又沒 trialPath → 顯示補寄提示，不當成功寄出", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, trialSent: false }) });
    render(<LeadForm />);
    fill("a@x.com"); fireEvent.click(screen.getByRole("checkbox")); submit();
    expect(await screen.findByText(/試看信暫時沒寄成/)).toBeTruthy();
    expect(watchLink()).toBeNull();
    expect(trackEvent).toHaveBeenCalled();
  });

  it("API 失敗 → 顯示錯誤、不送事件、表單留著可重試", async () => {
    global.fetch.mockResolvedValue({ ok: false, json: async () => ({ ok: false, error: "brevo_500" }) });
    render(<LeadForm />);
    fill("a@x.com"); fireEvent.click(screen.getByRole("checkbox")); submit();
    expect(await screen.findByText(/暫時無法送出/)).toBeTruthy();
    expect(trackEvent).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /立即觀看試看/ })).toBeTruthy();
  });
});

describe("LeadCapture（首頁深色橫幅）", () => {
  it("渲染標題、表單與同意勾選", () => {
    render(<LeadCapture />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toMatch(/免費試看課程影片/);
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByRole("checkbox")).toBeTruthy();
  });
});
