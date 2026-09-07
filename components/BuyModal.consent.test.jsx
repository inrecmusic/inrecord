// @vitest-environment jsdom
// 結帳二次確認：第一步要勾「同意服務條款及退費政策」才能下一步；第二步顯示訂單摘要與條款版本，按「確認購買」才送出。
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("@/lib/attribution", () => ({ readAttributionCookie: () => null, readFbCookies: () => ({}) }));
vi.mock("@/lib/track-event", () => ({ trackEvent: vi.fn() }));

import BuyModal from "./BuyModal";

afterEach(cleanup);
beforeEach(() => { global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ url: "https://pay.example", fields: {} }) })); });

const plan = { plan: "bundle", label: "課程包 AI", price: 6999 };
const open = () => render(<BuyModal open onClose={() => {}} plan={plan} email="a@x.com" pricing={{ price: 4299, originalPrice: 6999 }} termsVersion="2026-09-07" />);

describe("BuyModal 結帳二次確認", () => {
  it("未勾同意：按鈕停用並提示；勾了變「下一步」", () => {
    open();
    const btn = screen.getByRole("button", { name: /請先勾選同意/ });
    expect(btn.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /服務條款/ }));
    expect(screen.getByRole("button", { name: /下一步/ }).disabled).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("下一步 → 摘要列出課程／實付價格／授權期間／條款版本；返回可回第一步；確認購買才打 checkout 並帶 agreeTerms", async () => {
    open();
    fireEvent.click(screen.getByRole("checkbox", { name: /服務條款/ }));
    fireEvent.click(screen.getByRole("button", { name: /下一步/ }));
    expect(await screen.findByText("課程名稱")).toBeTruthy(); // goSummary 先做非同步發票檢查
    expect(screen.getByText("NT$4,299")).toBeTruthy();
    expect(screen.getByText(/至少 3 年/)).toBeTruthy();
    expect(screen.getByText("2026-09-07")).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /返回修改/ }));
    expect(screen.getByRole("button", { name: /下一步/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /下一步/ }));
    fireEvent.click(await screen.findByRole("button", { name: /確認購買/ }));
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/payuni/checkout");
    const body = JSON.parse(init.body);
    expect(body.agreeTerms).toBe(true);
    expect(body.plan).toBe("bundle");
  });
});
