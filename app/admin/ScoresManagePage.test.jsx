// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";

vi.mock("@/lib/admin-client", () => ({ adminFetch: vi.fn() }));
vi.mock("@/components/classroom/score/InteractiveScore", () => ({ default: ({ title }) => <div data-testid="preview">預覽：{title}</div> }));

import ScoresManagePage from "./ScoresManagePage";
import { adminFetch } from "@/lib/admin-client";

const fx = (n) => readFileSync(`${process.cwd()}/lib/score/fixtures/${n}`, "utf8");
const V1 = "11111111-1111-4111-8111-111111111111";
const ROWS = [
  { id: "a1", title: "小蜜蜂", subtitle: "右手旋律", format: "abc", published: true, difficulty: null, version: 1, units: [{ video_id: V1, title: "1-2【跟練】Do 之歌" }], updated_at: "2026-09-27T00:00:00Z" },
  { id: "s1", title: "小蜜蜂雙手", subtitle: null, format: "musicxml", published: false, difficulty: 1, version: 2, units: [], updated_at: "2026-10-29T00:00:00Z" },
];
const json = (data, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => data });

beforeEach(() => {
  adminFetch.mockImplementation((path, opts) => {
    if (path === "/api/admin/scores" && (!opts || !opts.method)) return json({ data: ROWS });
    if (path === "/api/admin/chapters") return json({ data: [{ id: "c1", title: "Ch1 基礎" }] });
    if (path === "/api/admin/videos") return json({ data: [{ id: V1, chapter_id: "c1", title: "1-2【跟練】Do 之歌" }] });
    return json({ ok: true, id: "s9" });
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const pickFile = (name, text) => {
  const input = screen.getByLabelText(/樂譜檔/);
  fireEvent.change(input, { target: { files: [new File([text], name, { type: "application/xml" })] } });
};

describe("ScoresManagePage（後台曲目）", () => {
  it("列表：舊版 ABC 標籤、只有發布／下架，沒有編輯", async () => {
    render(<ScoresManagePage showToast={() => {}} />);
    const abcRow = (await screen.findByText("右手旋律")).closest("tr");
    expect(within(abcRow).getByText("舊版 ABC")).toBeTruthy();
    expect(within(abcRow).queryByRole("button", { name: "編輯" })).toBe(null);
    expect(within(abcRow).getByRole("button", { name: "下架" })).toBeTruthy();
    const v2Row = screen.getByText("小蜜蜂雙手").closest("tr");
    expect(within(v2Row).getByRole("button", { name: "編輯" })).toBeTruthy();
    expect(within(v2Row).getByText("草稿")).toBeTruthy();
    expect(within(v2Row).getByText("入門")).toBeTruthy();
  });

  it("選三行以上的譜：顯示錯誤、儲存鈕停用", async () => {
    render(<ScoresManagePage showToast={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "新增曲目" }));
    fireEvent.change(screen.getByLabelText("曲名"), { target: { value: "x" } });
    pickFile("three.musicxml", fx("twinkle-grand.musicxml").replace("<staves>2</staves>", "<staves>3</staves>"));
    expect(await screen.findByText(/最多兩行/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "儲存" }).disabled).toBe(true);
  });

  it("選只有右手的譜：可以儲存，並提示左手會自動產生", async () => {
    render(<ScoresManagePage showToast={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "新增曲目" }));
    pickFile("melody.musicxml", fx("twinkle-melody.musicxml"));
    expect((await screen.findByTestId("score-warnings")).textContent).toMatch("自動");
    expect(screen.getByRole("button", { name: "儲存" }).disabled).toBe(false);
  });

  it("選壓力測試檔：列出略過的記號", async () => {
    render(<ScoresManagePage showToast={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "新增曲目" }));
    pickFile("stress.musicxml", fx("stress.musicxml"));
    const box = await screen.findByTestId("score-warnings");
    for (const w of ["踏板", "表情記號", "裝飾音"]) expect(box.textContent).toContain(w);
  });

  it("新建送出不帶 published（交給後端預設草稿）、帶單元", async () => {
    render(<ScoresManagePage showToast={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "新增曲目" }));
    pickFile("bee.musicxml", fx("twinkle-grand.musicxml"));
    await screen.findByText(/8 小節/);
    fireEvent.change(screen.getByLabelText("曲名"), { target: { value: "小蜜蜂雙手" } });
    fireEvent.click(screen.getByLabelText("1-2【跟練】Do 之歌"));
    fireEvent.click(screen.getByRole("button", { name: "預覽" }));
    expect(screen.getByTestId("preview").textContent).toContain("小蜜蜂雙手");
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));
    await waitFor(() => expect(adminFetch.mock.calls.some(([p, o]) => p === "/api/admin/scores" && o?.method === "POST")).toBe(true));
    const [, opts] = adminFetch.mock.calls.find(([p, o]) => p === "/api/admin/scores" && o?.method === "POST");
    const body = JSON.parse(opts.body);
    expect("published" in body).toBe(false);
    expect(body.unitIds).toEqual([V1]);
    expect(body.musicxml).toContain("score-partwise");
    expect(body.file_name).toBe("bee.musicxml");
  });

  it("發布草稿送 PATCH published:true", async () => {
    render(<ScoresManagePage showToast={() => {}} />);
    const v2Row = (await screen.findByText("小蜜蜂雙手")).closest("tr");
    fireEvent.click(within(v2Row).getByRole("button", { name: "發布" }));
    await waitFor(() => expect(adminFetch.mock.calls.some(([p, o]) => o?.method === "PATCH")).toBe(true));
    const [, opts] = adminFetch.mock.calls.find(([, o]) => o?.method === "PATCH");
    expect(JSON.parse(opts.body)).toEqual({ id: "s1", published: true });
  });
});
