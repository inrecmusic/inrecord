// @vitest-environment jsdom
// 教室遊戲視窗：返回後再開同一款遊戲（快取命中）不可先畫「即將上線」再換 srcdoc——
// 沙箱 iframe 在 Chrome 換 srcdoc 會停在黑畫面（2026-10-03 實測）。
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";

vi.mock("./shared", () => ({
  freshToken: async (t) => t,
  getDeviceId: () => "dev-1",
  F: "system-ui",
}));

import GamePlayerOverlay from "./GamePlayerOverlay";

const GAME_HTML = "<html><body>音名快閃</body></html>";
const game = { id: "g1", title: "音名快閃" };

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("GamePlayerOverlay", () => {
  it("快取命中：第一次 render 就直接是遊戲內容，不經過「即將上線」", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const cache = { current: { g1: { ...game, html_content: GAME_HTML } } };
    // 盯 srcdoc 屬性：同一個 iframe 被改 srcdoc（舊寫法：先「即將上線」再換遊戲）就會留下紀錄
    const container = document.body.appendChild(document.createElement("div"));
    const swaps = [];
    const mo = new MutationObserver((ms) => ms.forEach((m) => swaps.push(m.oldValue)));
    mo.observe(container, { subtree: true, attributes: true, attributeFilter: ["srcdoc"], attributeOldValue: true });
    render(<GamePlayerOverlay game={game} token="t" cache={cache} onClose={() => {}} />, { container });
    swaps.push(...mo.takeRecords().map((m) => m.oldValue));
    mo.disconnect();
    expect(swaps).toEqual([]);
    const iframes = container.querySelectorAll("iframe");
    expect(iframes).toHaveLength(1);
    expect(iframes[0].getAttribute("srcdoc")).toBe(GAME_HTML);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("沒有快取：等內容回來後才建立遊戲 iframe，並寫入快取", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      status: 200, json: async () => ({ game: { ...game, html_content: GAME_HTML } }),
    });
    const cache = { current: {} };
    const { container } = render(<GamePlayerOverlay game={game} token="t" cache={cache} onClose={() => {}} />);
    expect(container.querySelector("iframe")).toBeNull(); // 載入中只有轉圈
    await act(async () => {});
    expect(container.querySelector("iframe").getAttribute("srcdoc")).toBe(GAME_HTML);
    expect(cache.current.g1.html_content).toBe(GAME_HTML);
  });

  it("請求失敗：退回「即將上線」，字色在黑底上看得見", async () => {
    let resolve;
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise((r) => { resolve = r; }));
    const { container } = render(<GamePlayerOverlay game={game} token="t" onClose={() => {}} />);
    await act(async () => {});
    // 請求失敗退回「即將上線」的 iframe
    await act(async () => { resolve({ status: 500, json: async () => ({}) }); });
    const empty = container.querySelector("iframe");
    expect(empty.getAttribute("srcdoc")).toContain("遊戲內容即將上線");
    expect(empty.getAttribute("srcdoc")).toContain("color:#cbd5e1");
  });
});
