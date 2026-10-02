// @vitest-environment jsdom
// 公開試玩頁的導購視窗：跟試看影片頁共用 UpsellPanel、玩完每局都彈、暫停只彈一次、保底計時文案中性。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import PlayTrial, { playCopy } from "./PlayTrial";
import { END_SIGNAL, injectEndSignal } from "@/lib/public-games";

const waveOffer = { mode: "wave", planName: "完整課程方案", price: 4549, originalPrice: 13800, deadlineMs: Date.parse("2026-10-08T16:00:00Z"), deadlineLabel: "10/9 00:00" };

const signal = (data, origin = window.location.origin) =>
  act(() => { window.dispatchEvent(new MessageEvent("message", { data, origin })); });

function mount(offer = waveOffer) {
  return render(<PlayTrial slug="flash" name="音名快閃" blurb="說明" chapter="第二章" offer={offer} />);
}

beforeEach(() => { vi.useFakeTimers({ now: Date.parse("2026-10-02T04:00:00Z") }); });
afterEach(() => { cleanup(); vi.useRealTimers(); document.body.style.overflow = ""; });

describe("playCopy", () => {
  it("保底計時不知道他玩到哪，不可宣稱玩完了", () => {
    expect(playCopy("timer").title).not.toMatch(/玩完/);
    expect(playCopy("result").title).toMatch(/玩完/);
  });
  it("帶出章節", () => {
    expect(playCopy("result", "第二章").sub).toContain("第二章");
  });
});

describe("導購視窗", () => {
  it("玩完一局 → 彈出與試看頁同一個視窗：價格、倒數、查看課程方案（帶遊戲 UTM）", () => {
    mount();
    expect(screen.queryByRole("dialog")).toBeNull();
    signal({ type: END_SIGNAL, reason: "result" });
    const dlg = screen.getByRole("dialog");
    expect(dlg.textContent).toContain("玩完一局了，感覺如何？");
    expect(dlg.textContent).toContain("NT$4,549");
    expect(dlg.textContent).toContain("NT$13,800");
    expect(dlg.textContent).toContain("距離下次調漲（10/9 00:00）還有");
    const cta = screen.getByRole("link", { name: "查看課程方案" });
    expect(cta.getAttribute("href")).toBe("/?utm_source=game&utm_medium=trial&utm_campaign=play-flash#pricing");
  });

  it("關掉只收起視窗（露出遊戲自己的結果畫面），下一局玩完會再彈", () => {
    mount();
    signal({ type: END_SIGNAL, reason: "result" });
    fireEvent.click(screen.getByRole("button", { name: "先看這局成績" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).not.toBe("hidden");
    signal({ type: END_SIGNAL, reason: "result" });
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("暫停只彈一次，關閉鈕是「回到遊戲」", () => {
    mount();
    signal({ type: END_SIGNAL, reason: "pause" });
    expect(screen.getByRole("dialog").textContent).toContain("先休息一下？");
    fireEvent.click(screen.getByRole("button", { name: "回到遊戲" }));
    signal({ type: END_SIGNAL, reason: "pause" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("舊版訊號（沒帶 reason）當作玩完", () => {
    mount();
    signal({ type: END_SIGNAL });
    expect(screen.getByRole("dialog").textContent).toContain("玩完一局了");
  });

  it("別的來源送來的訊息不理", () => {
    mount();
    signal({ type: END_SIGNAL, reason: "result" }, "https://evil.example");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("訊號一直沒來 → 150 秒保底彈中性版；訊號來過就不再保底", () => {
    mount();
    act(() => { vi.advanceTimersByTime(150_000); });
    expect(screen.getByRole("dialog").textContent).toContain("玩得還順手嗎？");
    cleanup();

    mount();
    signal({ type: END_SIGNAL, reason: "pause" });
    fireEvent.click(screen.getByRole("button", { name: "回到遊戲" }));
    act(() => { vi.advanceTimersByTime(150_000); });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("讀不到價格（none）就不報價，但 CTA 照樣在", () => {
    mount({ mode: "none" });
    signal({ type: END_SIGNAL, reason: "result" });
    expect(screen.getByRole("dialog").textContent).not.toContain("NT$");
    expect(screen.getByRole("link", { name: "查看課程方案" })).toBeTruthy();
  });
});

describe("注入 iframe 的訊號 script", () => {
  it("結果畫面亮起送 reason=result、暫停遮罩亮起送 reason=pause", async () => {
    document.body.innerHTML = '<div id="scr-result" class="scr"></div><div id="pauseMask" class="mask"></div>';
    const code = injectEndSignal("<body></body>").match(/<script>([\s\S]*)<\/script>/)[1];
    const post = vi.spyOn(window, "postMessage").mockImplementation(() => {});
    new Function(code)();
    document.getElementById("pauseMask").classList.add("on");
    await Promise.resolve();
    document.getElementById("scr-result").classList.add("on");
    await Promise.resolve();
    expect(post.mock.calls.map((c) => c[0])).toEqual([
      { type: END_SIGNAL, reason: "pause" },
      { type: END_SIGNAL, reason: "result" },
    ]);
    post.mockRestore();
  });
});
