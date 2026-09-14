// @vitest-environment jsdom
// 首頁社會證明數字：伺服端已帶入 initialStats 時直接渲染、不再打 /api/stats；
// 沒帶（DB 未設／查詢失敗）才退回前端 fetch 的舊行為。同時是整頁 render 的 smoke test。
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";

vi.mock("@/lib/supabase", () => ({ supabase: null }));

const SALE = {
  state: "list", onSale: true, classroomOpen: false, salesStartAt: null, nextIncreaseAt: null,
  plans: { course: { price: 3800, originalPrice: 3800 }, bundle: { price: 3999, originalPrice: 3999 } },
  fanPlan: { enabled: false, deadlineMs: 1893456000000, directPrice: 3999, proofPrice: 3699 }, openAt: null, fanProofOpen: false,
};
const STATS = { ok: true, purchases: 3, rating: 4.8, ratingCount: 5 };

class IO { observe() {} unobserve() {} disconnect() {} }
function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
}

let HomeClient;
beforeEach(async () => {
  vi.stubGlobal("IntersectionObserver", IO);
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: async () => STATS })));
  HomeClient = (await import("./HomeClient.jsx")).default;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("HomeClient 社會證明", () => {
  it("有 initialStats：首屏直接渲染人數／星等，不打 /api/stats", async () => {
    const { container } = render(<HomeClient sale={SALE} initialStats={STATS} />);
    expect(container.textContent).toContain("已有 3+ 位學員加入");
    expect(container.textContent).toContain("4.8");
    expect(fetch).not.toHaveBeenCalled();
    // hero 首屏文字用 heroRise（不動 opacity）：首次 render 就不是 opacity:0（否則 SSR 輸出透明、LCP 拖到 hydration 後）
    expect(container.querySelector("h1").style.opacity).not.toBe("0");
  });

  it("沒有 initialStats：退回前端 fetch /api/stats（舊行為）", async () => {
    const { container } = render(<HomeClient sale={SALE} />);
    await waitFor(() => expect(container.textContent).toContain("已有 3+ 位學員加入"));
    expect(fetch).toHaveBeenCalledWith("/api/stats");
  });
});
