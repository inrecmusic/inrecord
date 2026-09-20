// @vitest-environment jsdom
// 結帳金額一致性：畫面上「確認購買」看到的金額，必須等於後端實際建單的金額。
// 首頁價格是 60 秒 ISR 快照＋分頁開著的時間，波段剛換價時兩者會不一致，
// 而條款寫契約在按下那一刻成立 → 不一致就退回第一步重新確認，不可默默用新價收款。
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("@/lib/attribution", () => ({ readAttributionCookie: () => null, readFbCookies: () => ({}) }));
vi.mock("@/lib/track-event", () => ({ trackEvent: vi.fn() }));

import BuyModal from "./BuyModal";

afterEach(cleanup);
beforeEach(() => {
  vi.restoreAllMocks();
  // 送出用的 form 是直接 appendChild 到 body 的（正常瀏覽器會隨即導頁），RTL 的 cleanup 不會清掉；
  // 不清會讓下一個案例誤判成「有導去 PAYUNi」。
  document.querySelectorAll(`form[action="${PAY_URL}"]`).forEach((f) => f.remove());
});

const plan = { plan: "bundle", label: "課程包 AI", price: 6999 };
const PAY_URL = "https://pay.example";

function mockCheckout(amount) {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => (amount === undefined ? { url: PAY_URL, fields: {} } : { url: PAY_URL, amount, fields: {} }),
  }));
}

// 走完「勾同意 → 下一步 → 確認購買」
async function buy() {
  render(<BuyModal open onClose={() => {}} plan={plan} email="a@x.com" pricing={{ price: 4299, originalPrice: 6999 }} termsVersion="2026-09-07" />);
  fireEvent.click(screen.getByRole("checkbox", { name: /服務條款/ }));
  fireEvent.click(screen.getByRole("button", { name: /下一步/ }));
  fireEvent.click(await screen.findByRole("button", { name: /確認購買/ }));
  await vi.waitFor(() => expect(global.fetch).toHaveBeenCalled());
}

const payForm = () => document.querySelector(`form[action="${PAY_URL}"]`);

describe("BuyModal：確認金額與後端實收一致", () => {
  it("金額一致 → 照常導去 PAYUNi", async () => {
    mockCheckout(4299);
    await buy();
    await vi.waitFor(() => expect(payForm()).toBeTruthy());
  });

  it("後端金額不同 → 退回第一步、顯示新價，且不導去 PAYUNi", async () => {
    mockCheckout(5800);
    await buy();
    // 退回第一步：又看得到「下一步」按鈕
    expect(await screen.findByRole("button", { name: /下一步/ })).toBeTruthy();
    expect(screen.getByText(/價格已更新為 NT\$5,800/)).toBeTruthy();
    expect(payForm()).toBeNull();
  });

  it("後端沒回 amount（舊版相容）→ 不擋，照常導去 PAYUNi", async () => {
    mockCheckout(undefined);
    await buy();
    await vi.waitFor(() => expect(payForm()).toBeTruthy());
  });
});
