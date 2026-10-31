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
    expect(within(abcRow).getByRole("button", { name: "刪除" })).toBeTruthy();
    expect(within(abcRow).getByRole("button", { name: "下架" })).toBeTruthy();
    const v2Row = screen.getByText("小蜜蜂雙手").closest("tr");
    expect(within(v2Row).getByRole("button", { name: "編輯" })).toBeTruthy();
    expect(within(v2Row).getByText("草稿")).toBeTruthy();
    expect(within(v2Row).getByText("入門")).toBeTruthy();
  });

  it("上移／下移：第一首不能上移、最後一首不能下移；下移後重新編號、只送有變的", async () => {
    render(<ScoresManagePage showToast={() => {}} />);
    const first = (await screen.findByText("右手旋律")).closest("tr");
    const last = screen.getByText("小蜜蜂雙手").closest("tr");
    expect(within(first).getByRole("button", { name: /往上移/ }).disabled).toBe(true);
    expect(within(last).getByRole("button", { name: /往下移/ }).disabled).toBe(true);
    fireEvent.click(within(first).getByRole("button", { name: /往下移/ }));
    await waitFor(() => {
      const sent = adminFetch.mock.calls.filter(([, o]) => o?.method === "PATCH").map(([, o]) => JSON.parse(o.body));
      expect(sent).toEqual(expect.arrayContaining([{ id: "s1", sort_order: 0 }, { id: "a1", sort_order: 1 }]));
    });
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

describe("ScoresManagePage：直接打簡譜、伴奏設定、刪除", () => {
  const lastCall = (method) => {
    const c = adminFetch.mock.calls.filter(([p, o]) => p.startsWith("/api/admin/scores") && o?.method === method).pop();
    return c && { path: c[0], body: c[1].body ? JSON.parse(c[1].body) : null };
  };

  it("直接打簡譜：即時檢查、送出簡譜來源（不送 musicxml）", async () => {
    render(<ScoresManagePage showToast={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "新增曲目" }));
    fireEvent.click(screen.getByRole("tab", { name: "直接打簡譜" }));
    fireEvent.change(screen.getByLabelText("曲名"), { target: { value: "小蜜蜂" } });
    fireEvent.change(screen.getByLabelText("右手旋律（簡譜）"), { target: { value: "5 3 3 - | 4 2 2" } });
    expect(await screen.findByText(/第 2 小節有 3 拍/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("右手旋律（簡譜）"), { target: { value: "5 3 3 - | 4 2 2 -" } });
    fireEvent.change(screen.getByLabelText("和弦（每小節用 | 分開）"), { target: { value: "C | G7" } });
    expect(await screen.findByText(/2 小節/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));
    await waitFor(() => expect(lastCall("POST")).toBeTruthy());
    const { body } = lastCall("POST");
    expect(body.jianpu).toMatchObject({ key: "C", beats: 4, beatType: 4, melody: "5 3 3 - | 4 2 2 -", chords: "C | G7" });
    expect("musicxml" in body).toBe(false);
  });

  it("預設伴奏與每個單元指定伴奏", async () => {
    render(<ScoresManagePage showToast={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "新增曲目" }));
    pickFile("melody.musicxml", fx("twinkle-melody.musicxml"));
    await screen.findByTestId("score-warnings");
    fireEvent.change(screen.getByLabelText("預設伴奏"), { target: { value: "wave" } });
    fireEvent.click(screen.getByLabelText("1-2【跟練】Do 之歌"));
    fireEvent.change(screen.getByLabelText("1-2【跟練】Do 之歌 的伴奏"), { target: { value: "root" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));
    await waitFor(() => expect(lastCall("POST")).toBeTruthy());
    const { body } = lastCall("POST");
    expect(body.default_accompaniment).toBe("wave");
    expect(body.unit_accompaniment).toEqual({ [V1]: "root" });
    expect(body.unitIds).toEqual([V1]);
  });

  it("已發布的曲目也能刪（先確認）", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ScoresManagePage showToast={() => {}} />);
    const abcRow = (await screen.findByText("右手旋律")).closest("tr");
    fireEvent.click(within(abcRow).getByRole("button", { name: "刪除" }));
    await waitFor(() => expect(lastCall("DELETE")).toBeTruthy());
    expect(lastCall("DELETE").path).toBe("/api/admin/scores?id=a1");
    expect(window.confirm.mock.calls[0][0]).toMatch("已發布");
  });

  it("用簡譜建立的曲目可以再打開編輯簡譜", async () => {
    const jianpu = { key: "G", beats: 3, beatType: 4, tempo: 90, melody: "1 2 3", chords: "G" };
    adminFetch.mockImplementation((path, opts) => {
      if (path === "/api/admin/scores?id=s1") return json({ data: { ...ROWS[1], musicxml: fx("twinkle-melody.musicxml"), meta: { jianpu }, units: [] } });
      if (path === "/api/admin/scores" && !opts?.method) return json({ data: ROWS });
      if (path === "/api/admin/chapters") return json({ data: [] });
      if (path === "/api/admin/videos") return json({ data: [] });
      return json({ ok: true });
    });
    render(<ScoresManagePage showToast={() => {}} />);
    const v2Row = (await screen.findByText("小蜜蜂雙手")).closest("tr");
    fireEvent.click(within(v2Row).getByRole("button", { name: "編輯" }));
    expect((await screen.findByLabelText("右手旋律（簡譜）")).value).toBe("1 2 3");
    expect(screen.getByLabelText("調號").value).toBe("G");
    expect(screen.getByLabelText("拍號").value).toBe("3/4");
  });
  it("上傳的曲目可以改和弦：只送新的 MusicXML（音符不變）、版本加 1", async () => {
    const xml = fx("twinkle-melody.musicxml");
    adminFetch.mockImplementation((path, opts) => {
      if (path === "/api/admin/scores?id=s1") return json({ data: { ...ROWS[1], musicxml: xml, file_name: "bee.musicxml", meta: {}, units: [] } });
      if (path === "/api/admin/scores" && !opts?.method) return json({ data: ROWS });
      if (path === "/api/admin/chapters") return json({ data: [] });
      if (path === "/api/admin/videos") return json({ data: [] });
      return json({ ok: true, version: 3 });
    });
    render(<ScoresManagePage showToast={() => {}} />);
    const v2Row = (await screen.findByText("小蜜蜂雙手")).closest("tr");
    fireEvent.click(within(v2Row).getByRole("button", { name: "編輯" }));
    const box = await screen.findByLabelText(/^和弦（每小節用 \| 分開；只會改/);
    const bars = box.value.split("|");
    bars[0] = " Am ";
    fireEvent.change(box, { target: { value: bars.join("|") } });
    expect(screen.getByText(/儲存後變成 v3/)).toBeTruthy();
    fireEvent.change(box, { target: { value: bars.map((b, i) => (i === 1 ? "Hm" : b)).join("|") } });
    expect((await screen.findByRole("alert")).textContent).toContain("第 2 小節");
    fireEvent.change(box, { target: { value: bars.join("|") } });
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));
    await waitFor(() => expect(adminFetch.mock.calls.some(([, o]) => o?.method === "PATCH")).toBe(true));
    const body = JSON.parse(adminFetch.mock.calls.find(([, o]) => o?.method === "PATCH")[1].body);
    expect(body.musicxml).toContain("<kind>minor</kind>");
    expect(body.musicxml).not.toBe(xml);
  });
});
