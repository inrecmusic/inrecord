// @vitest-environment jsdom
// 側欄點同單元的第二首樂譜 → 分頁要直接開那一首，不是永遠開第一首
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";

vi.mock("./score/InteractiveScore", () => ({ default: ({ title }) => <div data-testid="score">{title}</div> }));

import ScoreTab from "./ScoreTab";

const SCORES = [
  { id: "s1", title: "生日快樂", format: "musicxml", musicxml: "<x/>" },
  { id: "s2", title: "快樂頌", format: "musicxml", musicxml: "<x/>" },
];

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("ScoreTab pickId", () => {
  it("有 pickId 就開那一首，沒有就開第一首", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ scores: SCORES }) })));
    const a = render(<ScoreTab token="t" video={{ id: "v1" }} pickId="s2" />);
    await waitFor(() => expect(a.getByTestId("score").textContent).toBe("快樂頌"));
    cleanup();
    const b = render(<ScoreTab token="t" video={{ id: "v1" }} />);
    await waitFor(() => expect(b.getByTestId("score").textContent).toBe("生日快樂"));
  });
});
