// @vitest-environment jsdom
// 進站彈窗：停留 6 秒或捲到一半才出現；關掉 7 天不再彈；已留過信箱或已登入不彈。
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

vi.mock("@/lib/track-event", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/attribution", () => ({ readAttributionCookie: () => null }));

import LeadPopup, { shouldShowPopup, DISMISS_KEY, DONE_KEY } from "./LeadPopup";

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

afterEach(() => { cleanup(); vi.useRealTimers(); });
beforeEach(() => { vi.useFakeTimers(); global.fetch = vi.fn(); });

describe("shouldShowPopup（純規則）", () => {
  const now = Date.parse("2026-09-07T00:00:00Z");
  it("已登入不彈；已留過信箱不彈", () => {
    expect(shouldShowPopup({ loggedIn: true, storage: mem(), now })).toBe(false);
    const s = mem(); s.setItem(DONE_KEY, "1");
    expect(shouldShowPopup({ loggedIn: false, storage: s, now })).toBe(false);
  });
  it("7 天內關過不彈；超過 7 天再彈；storage 壞掉照彈", () => {
    const s = mem(); s.setItem(DISMISS_KEY, String(now - 6 * 86400e3));
    expect(shouldShowPopup({ loggedIn: false, storage: s, now })).toBe(false);
    s.setItem(DISMISS_KEY, String(now - 8 * 86400e3));
    expect(shouldShowPopup({ loggedIn: false, storage: s, now })).toBe(true);
    expect(shouldShowPopup({ loggedIn: false, storage: { getItem() { throw new Error("x"); } }, now })).toBe(true);
  });
});

describe("LeadPopup（元件）", () => {
  it("一開始不出現；停留 6 秒後出現，關閉寫入 dismissed 時間並消失", () => {
    const s = mem();
    render(<LeadPopup storage={s} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => { vi.advanceTimersByTime(6000); });
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /關閉/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(Number(s.getItem(DISMISS_KEY))).toBeGreaterThan(0);
  });

  it("捲到一半就提前出現", () => {
    render(<LeadPopup storage={mem()} />);
    Object.defineProperty(document.documentElement, "scrollHeight", { value: 4000, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    window.scrollY = 1700; // (4000-800)*0.5 = 1600
    act(() => { window.dispatchEvent(new Event("scroll")); });
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("已登入或已留過信箱：等再久都不出現", () => {
    const s = mem(); s.setItem(DONE_KEY, "1");
    render(<LeadPopup storage={s} />);
    act(() => { vi.advanceTimersByTime(10000); });
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup();
    render(<LeadPopup loggedIn storage={mem()} />);
    act(() => { vi.advanceTimersByTime(10000); });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("送出成功 → 記 done，之後不再彈", async () => {
    vi.useRealTimers();
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, trialSent: true }) });
    const s = mem();
    render(<LeadPopup storage={s} delayMs={0} />);
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@x.com" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /寄試看/ }));
    expect(await screen.findByText(/試看連結已寄到/)).toBeTruthy();
    expect(s.getItem(DONE_KEY)).toBe("1");
  });
});
