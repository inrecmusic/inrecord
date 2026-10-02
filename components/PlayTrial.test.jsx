// @vitest-environment jsdom
// 公開試玩頁：玩完一局先講成就再給完整 CTA（含截止與之後價）；暫停／保底只出底部小提示，主按鈕「繼續玩」。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import PlayTrial, { playCopy, validScore, hintPrice } from "./PlayTrial";
import { END_SIGNAL, injectEndSignal, publicGame } from "@/lib/public-games";

const waveOffer = {
  mode: "wave", planName: "完整課程方案", price: 4549, originalPrice: 13800, nextPrice: 4799,
  deadlineMs: Date.parse("2026-10-08T16:00:00Z"), deadlineLabel: "10/8 23:59",
};
const flash = publicGame("flash");

const signal = (data, origin = window.location.origin) =>
  act(() => { window.dispatchEvent(new MessageEvent("message", { data, origin })); });

function mount(offer = waveOffer) {
  return render(<PlayTrial slug="flash" name="音名快閃" blurb="說明" game={flash} offer={offer} />);
}

beforeEach(() => { vi.useFakeTimers({ now: Date.parse("2026-10-02T04:00:00Z") }); });
afterEach(() => { cleanup(); vi.useRealTimers(); document.body.style.overflow = ""; });

describe("成就文案", () => {
  it("有成績：先講答對幾題，再接到課程章節", () => {
    const c = playCopy(flash, { ok: 8, total: 10 });
    expect(c.title).toBe("你剛剛答對了 8 / 10 個音名");
    expect(c.sub).toContain("第二章「音符的語言—音名與唱名」");
  });
  it("Do 給你找用自己的說法", () => {
    expect(playCopy(publicGame("do"), { ok: 7, total: 10 }).title).toBe("你剛剛找到了 7 / 10 次 Do");
  });
  it("0 分、讀不到或怪值 → 不講分數，退回中性版", () => {
    for (const s of [{ ok: 0, total: 10 }, {}, undefined, { ok: 11, total: 10 }, { ok: "x", total: 10 }, { ok: 3, total: 0 }]) {
      expect(validScore(s)).toBeNull();
      expect(playCopy(flash, s).title).toBe("玩完一局了，感覺如何？");
    }
  });
});

describe("小提示的價格句", () => {
  it("波段中寫截止與價格；過了截止或不是波段就不報價", () => {
    expect(hintPrice(waveOffer, Date.parse("2026-10-05T00:00:00Z"))).toBe("10/8 23:59 前 NT$4,549");
    expect(hintPrice(waveOffer, Date.parse("2026-10-09T00:00:00Z"))).toBe("");
    expect(hintPrice({ mode: "list", price: 13800 }, 0)).toBe("");
    expect(hintPrice(null, 0)).toBe("");
  });
});

describe("玩完一局：完整視窗", () => {
  it("先成就、再寫明截止與之後價、CTA 帶 utm_content=result", () => {
    mount();
    expect(screen.queryByRole("dialog")).toBeNull();
    signal({ type: END_SIGNAL, reason: "result", ok: 8, total: 10 });
    const dlg = screen.getByRole("dialog");
    expect(dlg.textContent).toContain("你剛剛答對了 8 / 10 個音名");
    expect(dlg.textContent).toContain("10/8 23:59 前 NT$4,549");
    expect(dlg.textContent).toContain("之後 NT$4,799");
    expect(dlg.textContent).toContain("距離調漲還有");
    const cta = screen.getByRole("link", { name: "查看課程方案" });
    expect(cta.getAttribute("href")).toBe("/?utm_source=game&utm_medium=trial&utm_campaign=play-flash&utm_content=result#pricing");
  });

  it("關掉只收起視窗（露出遊戲自己的結果畫面），下一局玩完會再彈", () => {
    mount();
    signal({ type: END_SIGNAL, reason: "result", ok: 8, total: 10 });
    fireEvent.click(screen.getByRole("button", { name: "先看這局成績" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).not.toBe("hidden");
    signal({ type: END_SIGNAL, reason: "result", ok: 9, total: 10 });
    expect(screen.getByRole("dialog").textContent).toContain("9 / 10");
  });

  it("舊版訊號（沒帶 reason／成績）當作玩完，用中性標題", () => {
    mount();
    signal({ type: END_SIGNAL });
    expect(screen.getByRole("dialog").textContent).toContain("玩完一局了");
  });

  it("讀不到價格（none）就不報價，但 CTA 照樣在", () => {
    mount({ mode: "none" });
    signal({ type: END_SIGNAL, reason: "result", ok: 8, total: 10 });
    expect(screen.getByRole("dialog").textContent).not.toContain("NT$");
    expect(screen.getByRole("link", { name: "查看課程方案" })).toBeTruthy();
  });

  it("別的來源送來的訊息不理", () => {
    mount();
    signal({ type: END_SIGNAL, reason: "result" }, "https://evil.example");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("暫停：只出小提示，不跳全螢幕", () => {
  it("暫停 → 底部小提示（不鎖捲動），主按鈕「繼續玩」，提示的連結帶 utm_content=hint", () => {
    mount();
    signal({ type: END_SIGNAL, reason: "pause" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).not.toBe("hidden");
    const hint = screen.getByRole("status");
    expect(hint.textContent).toContain("先休息一下");
    expect(hint.textContent).toContain("10/8 23:59 前 NT$4,549");
    expect(screen.getByRole("link", { name: "查看課程方案" }).getAttribute("href"))
      .toBe("/?utm_source=game&utm_medium=trial&utm_campaign=play-flash&utm_content=hint#pricing");
    expect(screen.getByRole("button", { name: "繼續玩" })).toBeTruthy();
  });

  it("按「繼續玩」收起提示；遊戲自己繼續（resume 訊號）也會收起", () => {
    mount();
    signal({ type: END_SIGNAL, reason: "pause" });
    fireEvent.click(screen.getByRole("button", { name: "繼續玩" }));
    expect(screen.queryByRole("status")).toBeNull();
    signal({ type: END_SIGNAL, reason: "pause" });
    expect(screen.getByRole("status")).toBeTruthy();
    signal({ type: END_SIGNAL, reason: "resume" });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("暫停中一局結束 → 收起提示，換成完整視窗", () => {
    mount();
    signal({ type: END_SIGNAL, reason: "pause" });
    signal({ type: END_SIGNAL, reason: "result", ok: 5, total: 10 });
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

describe("保底計時", () => {
  it("訊號一直沒來 → 150 秒出小提示（不跳全螢幕）；訊號來過就不再保底", () => {
    mount();
    act(() => { vi.advanceTimersByTime(150_000); });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("玩得還順手嗎？");
    cleanup();

    mount();
    signal({ type: END_SIGNAL, reason: "pause" });
    signal({ type: END_SIGNAL, reason: "resume" });
    act(() => { vi.advanceTimersByTime(150_000); });
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("注入 iframe 的訊號 script", () => {
  it("暫停／繼續送 pause／resume；結果畫面亮起送 result＋畫面上的成績", async () => {
    document.body.innerHTML =
      '<div id="scr-result" class="scr"><div id="rStats"></div></div><div id="pauseMask" class="mask"></div>';
    const code = injectEndSignal("<body></body>").match(/<script>([\s\S]*)<\/script>/)[1];
    const post = vi.spyOn(window, "postMessage").mockImplementation(() => {});
    new Function(code)();
    const mask = document.getElementById("pauseMask");
    mask.classList.add("on");
    await Promise.resolve();
    mask.classList.remove("on");
    await Promise.resolve();
    document.getElementById("rStats").textContent = "答對 8 / 10"; // 遊戲在亮起結果畫面前就寫好
    document.getElementById("scr-result").classList.add("on");
    await Promise.resolve();
    expect(post.mock.calls.map((c) => c[0])).toEqual([
      { type: END_SIGNAL, reason: "pause" },
      { type: END_SIGNAL, reason: "resume" },
      { type: END_SIGNAL, reason: "result", ok: 8, total: 10 },
    ]);
    post.mockRestore();
  });
});
