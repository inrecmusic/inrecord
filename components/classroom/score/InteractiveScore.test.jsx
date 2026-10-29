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

  it("拿掉左手伴奏與節奏斜線，改成只看右手", () => {
    const { container } = render(<InteractiveScore xml={BEE} title="小蜜蜂" />);
    const text = container.textContent;
    for (const t of ["左手伴奏", "節奏斜線", "顯示左手"]) expect(text).not.toContain(t);
    expect(screen.getByRole("button", { name: "只看右手" })).toBeTruthy();
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
    await waitFor(() => expect(screen.getByRole("button", { name: "只看右手" })).toBeTruthy());
    expect(screen.queryByText(/只有右手旋律/)).toBe(null);
  });
});
