// @vitest-environment jsdom
// 試看頁導購視窗：三層觸發（ended／連續看到 92%／點進播放器後的 300 秒保底）、只彈一次、三種價格狀態、法務紅線。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import TrialUpsell, { fmtCountdown, nt, upsellCopy } from "./TrialUpsell";
import { LICENSE_TERM_TEXT } from "@/lib/terms-version";

const FAN_DEADLINE = Date.parse("2026-09-16T15:59:00Z"); // 9/16 23:59 台灣
const fanOffer = { mode: "fan", price: 3999, originalPrice: 13800, deadlineMs: FAN_DEADLINE, deadlineLabel: "9/16 23:59" };
const waveOffer = { mode: "wave", price: 4299, originalPrice: 13800, deadlineMs: Date.parse("2026-09-25T16:00:00Z"), deadlineLabel: "9/26 00:00" };

let handlers;
function installPlayerjs() {
  handlers = {};
  window.playerjs = { Player: class { on(ev, cb) { (handlers[ev] ||= []).push(cb); } } };
}
const emit = (ev, arg) => act(() => { (handlers[ev] || []).forEach((f) => f(arg)); });
const flush = () => act(async () => {});

function mountIframe() {
  const f = document.createElement("iframe");
  f.id = "trial-player";
  document.body.appendChild(f);
  return f;
}

beforeEach(() => {
  vi.useFakeTimers({ now: Date.parse("2026-09-13T00:00:00Z") });
  document.body.innerHTML = "";
  mountIframe();
});
afterEach(() => { cleanup(); vi.useRealTimers(); delete window.playerjs; });

// 讓 player.js 就位並 ready（代表 ①② 會運作）
async function renderReady(offer = fanOffer) {
  installPlayerjs();
  render(<TrialUpsell playerId="trial-player" offer={offer} />);
  await flush();
  await emit("ready");
}

describe("純函式", () => {
  it("fmtCountdown：ms → N 天 HH:MM:SS，負值歸零", () => {
    expect(fmtCountdown(2 * 86400000 + 3 * 3600000 + 4 * 60000 + 5000)).toBe("2 天 03:04:05");
    expect(fmtCountdown(-1)).toBe("0 天 00:00:00");
  });
  it("nt：千分位", () => {
    expect(nt(3999)).toBe("3,999");
    expect(nt(13800)).toBe("13,800");
  });
  it("保底計時的文案不可宣稱使用者看完了", () => {
    expect(upsellCopy("timer").title).not.toMatch(/看完/);
    expect(upsellCopy("ended").title).toMatch(/看完/);
    expect(upsellCopy("progress").title).toMatch(/看完/);
  });
});

describe("三層觸發", () => {
  it("① player.js ended → 彈出，文案是肯定版", async () => {
    await renderReady();
    expect(screen.queryByRole("dialog")).toBeNull();
    await emit("ended");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/你看完了這 5 分鐘/)).toBeTruthy();
  });

  it("② 看到一半先彈中場版，連續播放到 92% 再換成看完版", async () => {
    await renderReady();
    // 以 1 秒一跳模擬連續播放（每跳都在 CONTINUOUS_MAX_S 內，才會累計成「真的看了」）
    for (let sec = 1; sec <= 140; sec += 1) await emit("timeupdate", { seconds: sec, duration: 300 }); // 46%
    expect(screen.queryByRole("dialog")).toBeNull();
    for (let sec = 141; sec <= 160; sec += 1) await emit("timeupdate", { seconds: sec, duration: 300 }); // 過半
    expect(screen.getByText(/看到一半了/)).toBeTruthy();
    expect(screen.queryByText(/你看完了/)).toBeNull();
    // 中途關掉，看完時要能再彈一次
    fireEvent.click(screen.getByLabelText("關閉"));
    expect(screen.queryByRole("dialog")).toBeNull();
    for (let sec = 161; sec <= 276; sec += 1) await emit("timeupdate", { seconds: sec, duration: 300 }); // 92%
    expect(screen.getByText(/你看完了/)).toBeTruthy();
  });

  it("中場只彈一次：關掉後不會因為繼續播放再彈中場", async () => {
    await renderReady();
    for (let sec = 1; sec <= 160; sec += 1) await emit("timeupdate", { seconds: sec, duration: 300 });
    fireEvent.click(screen.getByLabelText("關閉"));
    for (let sec = 161; sec <= 200; sec += 1) await emit("timeupdate", { seconds: sec, duration: 300 }); // 仍未到 92%
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("② 直接把進度條拖到片尾不算看完（不彈）", async () => {
    await renderReady();
    await emit("timeupdate", { seconds: 3, duration: 300 });
    await emit("timeupdate", { seconds: 290, duration: 300 }); // 一次跳 287 秒＝拖動，不計入累積
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("③ player.js 載入失敗 → 使用者點進播放器後 300 秒彈出，且文案換成中性版", async () => {
    delete window.playerjs;
    const iframe = document.getElementById("trial-player");
    render(<TrialUpsell playerId="trial-player" offer={fanOffer} />);
    const s = document.querySelector('script[src*="playerjs"]');
    expect(s).toBeTruthy();
    s.onerror();
    await flush();

    // 點進 iframe：母頁失焦且 activeElement 變成該 iframe —— 保底從這一刻才起算
    iframe.focus();
    fireEvent.blur(window);
    await act(async () => { vi.advanceTimersByTime(299000); });
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => { vi.advanceTimersByTime(1500); });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByText(/你看完了/)).toBeNull();
    expect(screen.getByText(/想把這 5 分鐘變成一首完整的歌/)).toBeTruthy();
  });

  it("③ 沒按播放就只把頁面開著，不會被彈窗蓋住影片", async () => {
    delete window.playerjs;
    render(<TrialUpsell playerId="trial-player" offer={fanOffer} />);
    document.querySelector('script[src*="playerjs"]').onerror();
    await flush();
    await act(async () => { vi.advanceTimersByTime(600000); }); // 10 分鐘
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("player.js 正常 ready 後就撤掉保底計時（中途暫停 3 分鐘不會被打擾）", async () => {
    await renderReady();
    await act(async () => { vi.advanceTimersByTime(200000); });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("同一次瀏覽只彈一次：關掉後再 ended 不會重彈", async () => {
    await renderReady();
    await emit("ended");
    fireEvent.click(screen.getByLabelText("關閉"));
    expect(screen.queryByRole("dialog")).toBeNull();
    await emit("ended");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("視窗行為", () => {
  it("Esc 可關、點遮罩可關、點視窗本身不關", async () => {
    await renderReady();
    await emit("ended");
    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.queryByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    // 重新掛載一份驗證點遮罩
    cleanup();
    document.body.innerHTML = "";
    mountIframe();
    await renderReady();
    await emit("ended");
    const backdrop = screen.getByRole("dialog").parentElement;
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("從視窗內拖曳選字、放開在遮罩上不會誤關", async () => {
    await renderReady();
    await emit("ended");
    const dialog = screen.getByRole("dialog");
    fireEvent.mouseDown(dialog); // 起點在面板內
    fireEvent.click(dialog.parentElement); // 放開落在遮罩
    expect(screen.queryByRole("dialog")).toBeTruthy();
  });

  it("開啟時鎖頁面捲動、焦點移進視窗；關閉後還給觸發元素並解鎖", async () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    await renderReady();
    await emit("ended");
    expect(document.body.style.overflow).toBe("hidden");
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(document.activeElement).toBe(trigger);
  });

  it("沒有 playerId 就完全不掛任何觸發", async () => {
    render(<TrialUpsell playerId="" offer={fanOffer} />);
    await act(async () => { vi.advanceTimersByTime(300000); });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("三種價格狀態（全部由 props 帶入，不寫死）", () => {
  it("粉絲方案開著：顯示粉絲價、劃線原價與截止倒數", async () => {
    await renderReady(fanOffer);
    await emit("ended");
    expect(screen.getByText("NT$3,999")).toBeTruthy();
    expect(screen.getByText("NT$13,800")).toBeTruthy();
    expect(screen.getByText(/距離 9\/16 23:59 截止還有/)).toBeTruthy();
    expect(screen.getByText(/粉絲限定/)).toBeTruthy();
  });

  it("粉絲已截止但在波段中：顯示波段價與下次調漲倒數", async () => {
    await renderReady(waveOffer);
    await emit("ended");
    expect(screen.getByText("NT$4,299")).toBeTruthy();
    expect(screen.getByText(/距離下次調漲（9\/26 00:00）還有/)).toBeTruthy();
  });

  it("都不符：不顯示任何價格，只留方案連結", async () => {
    await renderReady({ mode: "none" });
    await emit("ended");
    expect(screen.queryByText(/NT\$/)).toBeNull();
    expect(screen.queryByText(/倒數|調漲|截止/)).toBeNull();
    expect(screen.getByRole("link", { name: "查看課程方案" })).toBeTruthy();
  });

  it("截止時間已過就不渲染倒數（價格仍在）", async () => {
    vi.setSystemTime(FAN_DEADLINE + 1000);
    await renderReady(fanOffer);
    await emit("ended");
    expect(screen.queryByText(/截止還有/)).toBeNull();
    // 已過期就不報價：顯示已經買不到的價格比不顯示更糟
    expect(screen.queryByText("NT$3,999")).toBeNull();
    expect(screen.queryByText(/粉絲限定/)).toBeNull();
    expect(screen.getByText("查看課程方案")).toBeTruthy();
  });
});

describe("導購文案與追蹤", () => {
  it("主 CTA 連 /#pricing 帶 ref=trial-endcard，且不可帶 utm（會洗掉 last-touch 歸因）", async () => {
    await renderReady();
    await emit("ended");
    const href = screen.getByRole("link", { name: "查看課程方案" }).getAttribute("href");
    expect(href).toBe("/?ref=trial-endcard#pricing");
    expect(href).not.toMatch(/utm_/);
  });

  it("課程規模事實與 3 年保證寫法", async () => {
    await renderReady();
    await emit("ended");
    const txt = screen.getByRole("dialog").textContent;
    expect(txt).toContain("10 章節 ＋ 2 附錄，約 6 小時");
    expect(txt).toContain("24 個三和弦（12 個大三和弦 ＋ 12 個小三和弦）");
    expect(txt).toContain("10 首曲目實戰");
    expect(txt).not.toContain("流行曲目");
    // 法務句取 lib/terms-version 的 LICENSE_TERM_TEXT，本元件不自己講開課日期
    // 顯示時「至少 3 年」用不斷行空格綁住，比對前正規化回一般空格
    expect(txt.replace(/\u00a0/g, " ")).toContain(`一次買斷，${LICENSE_TERM_TEXT}。`);
    expect(txt).not.toMatch(/\d{4}\/\d{1,2}\/\d{1,2}/);
  });

  it("法務紅線：不出現永久／AI／立即開通／星等，也沒有驚嘆號", async () => {
    await renderReady();
    await emit("ended");
    const txt = screen.getByRole("dialog").textContent;
    for (const bad of ["永久", "AI", "立即開通", "馬上開通", "顆星", "評分", "！", "!"]) {
      expect(txt).not.toContain(bad);
    }
  });
});
