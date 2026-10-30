// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";

vi.mock("./StaffView", () => ({ default: () => <div data-testid="staff-view" /> }));
vi.mock("./grandPlayer", () => ({
  createGrandPlayer: () => ({
    load() {}, play: async () => true, stop() {}, dispose() {},
    onTick: () => () => {}, onEnd: () => () => {}, playing: false,
  }),
}));

import InteractiveScore from "./InteractiveScore";
import ScoreTab from "../ScoreTab";

const BEE = readFileSync(`${process.cwd()}/lib/score/fixtures/twinkle-grand.musicxml`, "utf8"); // jsdom 環境的 import.meta.url 不是 file:
const NO_CHORDS = BEE.replace(/<harmony[\s\S]*?<\/harmony>\s*/g, "");
const MELODY = readFileSync(`${process.cwd()}/lib/score/fixtures/twinkle-melody.musicxml`, "utf8");
const lhIds = (container) => [...container.querySelectorAll(".sv2-jianpu [data-id]")].length;

beforeEach(() => {
  global.ResizeObserver = class { observe() {} disconnect() {} };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("InteractiveScore", () => {
  it("顯示曲名、出處、譜面三選一、和弦標示", () => {
    render(<InteractiveScore xml={BEE} title="小蜜蜂" subtitle="InRecord 編曲" />);
    expect(screen.getByRole("heading", { name: "小蜜蜂" })).toBeTruthy();
    expect(screen.getByText("InRecord 編曲")).toBeTruthy();
    for (const name of ["五線譜", "簡譜", "對照"]) expect(screen.getByRole("button", { name })).toBeTruthy();
    for (const name of ["和弦名", "級數", "兩者"]) expect(screen.getByRole("button", { name })).toBeTruthy();
    expect(screen.getByText(/1=C/)).toBeTruthy();
    expect(screen.getByText(/♩ = 96/)).toBeTruthy();
  });

  it("hides chord control：譜裡沒有和弦就不顯示和弦標示", () => {
    render(<InteractiveScore xml={NO_CHORDS} title="小蜜蜂" />);
    expect(screen.queryByRole("button", { name: "和弦名" })).toBe(null);
    expect(screen.queryByText("和弦標示")).toBe(null);
  });

  it("預設 Lead Sheet 只顯示右手；按「顯示左手」才出現左手", () => {
    const { container } = render(<InteractiveScore xml={BEE} title="小蜜蜂" />);
    fireEvent.click(screen.getByRole("button", { name: "簡譜" }));
    const rhOnly = lhIds(container);
    expect(container.textContent).not.toContain("只看右手");
    const btn = screen.getByRole("button", { name: "顯示左手" });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(btn);
    expect(lhIds(container)).toBeGreaterThan(rhOnly);
  });

  it("左手伴奏選單：有原譜左手時多「原譜左手」並當預設", () => {
    render(<InteractiveScore xml={BEE} title="小蜜蜂" />);
    const sel = screen.getByLabelText("左手伴奏");
    expect([...sel.options].map((o) => o.textContent)).toEqual(["原譜左手", "柱式", "8-2 根音伴奏", "8-3 經典波浪", "8-4 交錯律動", "8-5 折返分解", "8-6 五度伴奏", "8-7 五八度伴奏", "8-8 先八度後五度"]);
    expect(sel.value).toBe("original");
  });

  it("只有右手的曲子：預設柱式（或後台指定的預設），切換會換左手", () => {
    const { container } = render(<InteractiveScore xml={MELODY} title="小蜜蜂" defaultAccompaniment="wave" />);
    const sel = screen.getByLabelText("左手伴奏");
    expect([...sel.options].map((o) => o.value)).toEqual(["block", "root", "wave", "rocking", "arch", "power", "r158", "r185"]);
    expect(sel.value).toBe("wave");
    fireEvent.click(screen.getByRole("button", { name: "簡譜" }));
    fireEvent.click(screen.getByRole("button", { name: "顯示左手" }));
    const wave = lhIds(container);
    fireEvent.change(sel, { target: { value: "block" } });
    expect(lhIds(container)).toBeLessThan(wave);
  });

  it("單元鎖定伴奏：不能切換，顯示固定型態", () => {
    render(<InteractiveScore xml={MELODY} title="小蜜蜂" lockedAccompaniment="root" />);
    const sel = screen.getByLabelText("左手伴奏");
    expect(sel.value).toBe("root");
    expect(sel.disabled).toBe(true);
  });

  it("沒有和弦的單行譜：沒有左手相關控制", () => {
    const plain = readFileSync(`${process.cwd()}/lib/score/fixtures/single-staff.musicxml`, "utf8");
    render(<InteractiveScore xml={plain} title="x" />);
    expect(screen.queryByLabelText("左手伴奏")).toBe(null);
    expect(screen.queryByRole("button", { name: "顯示左手" })).toBe(null);
  });

  it("節奏斜線開關預設開", () => {
    render(<InteractiveScore xml={BEE} title="小蜜蜂" />);
    expect(screen.getByRole("button", { name: "節奏斜線" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("播放控制與 A-B 循環", () => {
    render(<InteractiveScore xml={BEE} title="小蜜蜂" />);
    expect(screen.getByRole("button", { name: /播放/ })).toBeTruthy();
    expect(screen.getByRole("slider", { name: /速度/ }).value).toBe("96");
    for (const name of ["節拍器", "預備拍", "右手", "左手", "循環"]) expect(screen.getByRole("button", { name })).toBeTruthy();
    expect(screen.getByLabelText("循環起點小節").querySelectorAll("option").length).toBe(8);
  });

  it("切到簡譜畫出每個音、對照兩種都有", () => {
    const { container } = render(<InteractiveScore xml={BEE} title="小蜜蜂" />);
    fireEvent.click(screen.getByRole("button", { name: "簡譜" }));
    expect(container.querySelector('[data-id="n0"]')).toBeTruthy();
    expect(screen.queryByTestId("staff-view")).toBe(null);
    fireEvent.click(screen.getByRole("button", { name: "對照" }));
    expect(screen.getByTestId("staff-view")).toBeTruthy();
    expect(container.querySelector('[data-id="n0"]')).toBeTruthy();
  });

  it("解析失敗顯示白話錯誤、不丟例外", () => {
    render(<InteractiveScore xml="<svg/>" title="壞檔" />);
    expect(screen.getByText(/這份樂譜讀不出來/)).toBeTruthy();
  });
});

describe("ScoreTab 依 format 分流", () => {
  const mockFetch = (scores) => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ scores }) }));
  };

  it("format:'abc' 渲染舊畫面", async () => {
    mockFetch([{ id: "a1", title: "小蜜蜂", subtitle: "右手旋律", format: "abc", abc: "X:1\nT:小蜜蜂\nM:2/4\nL:1/8\nK:C\nG2 EE|", sort_order: 0 }]);
    render(<ScoreTab token="t" video={{ id: "v1" }} />);
    await waitFor(() => expect(screen.getByText(/只有右手旋律/)).toBeTruthy());
  });

  it("format:'musicxml' 渲染新元件", async () => {
    mockFetch([{ id: "s1", title: "小蜜蜂雙手", subtitle: null, format: "musicxml", musicxml: BEE, version: 1, sort_order: 0 }]);
    render(<ScoreTab token="t" video={{ id: "v1" }} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "顯示左手" })).toBeTruthy());
    expect(screen.queryByText(/只有右手旋律/)).toBe(null);
  });
});
