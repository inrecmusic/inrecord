// @vitest-environment jsdom
// 試看頁 smoke test：釘住原本就有的四種狀態（簽章有效有影片／簽章有效但沒填影片 ID／
// 功能未開／簽章無效顯示留信箱表單），避免加導購視窗時改壞任何一種。
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/lib/track-event", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/attribution", () => ({ readAttributionCookie: () => null }));
vi.mock("@/lib/trial", () => ({
  TRIAL_CONTENT_KEY: "trial_video_id",
  verifyTrialToken: (e, t) => e === "a@b.co" && t === "good",
}));
vi.mock("@/lib/bunny", () => ({ signBunnyEmbedUrl: (id) => `https://iframe.mediadelivery.net/embed/1/${id}?token=x` }));

let videoId = "guid-1";
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { body_md: videoId } }) }) }) }),
  }),
}));

const SETTINGS = {
  list_price: { bundle: 13800 },
  waves: [{ starts_at: "2026-09-14T00:00:00+08:00", ends_at: "2026-09-26T00:00:00+08:00", prices: { bundle: 4299 } }],
  fan_plan: { enabled: true, deadline: "2026-09-16T23:59:00+08:00", proof_price: 3699, direct_price: 3999 },
};
vi.mock("@/lib/sale", async (orig) => ({ ...(await orig()), getSaleSettings: async () => SETTINGS }));

import TrialPage from "./page";

const VALID = { e: "a@b.co", t: "good" };
afterEach(() => { cleanup(); vi.unstubAllEnvs(); videoId = "guid-1"; });

async function show(searchParams, leadCapture = "on") {
  vi.stubEnv("LEAD_CAPTURE", leadCapture);
  render(await TrialPage({ searchParams }));
}

describe("試看頁四種狀態", () => {
  it("① 簽章有效有影片：播放器 ＋ 兩層說明 ＋ 兩顆按鈕", async () => {
    await show(VALID);
    const iframe = document.querySelector("iframe#trial-player");
    expect(iframe).toBeTruthy();
    expect(iframe.getAttribute("src")).toContain("guid-1");
    expect(screen.getByText(/跟正式課程同一套內容/)).toBeTruthy();
    expect(screen.getByText(/經過剪輯、部分片段也加快了/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "查看課程方案" }).getAttribute("href")).toBe("/?ref=trial-page#pricing");
    expect(screen.getByRole("link", { name: "回官網首頁" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull(); // 導購視窗要等觸發才出現
  });

  it("② 簽章有效但後台沒填影片 ID：顯示準備中，不掛播放器也不掛導購觸發", async () => {
    videoId = "";
    await show(VALID);
    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.getByText(/試看影片準備中/)).toBeTruthy();
  });

  it("③ 功能未開（LEAD_CAPTURE 未設）：即將開放卡片，不驗簽章", async () => {
    await show(VALID, "");
    expect(screen.getByText("免費試看即將開放")).toBeTruthy();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("④ 簽章無效：留信箱表單再寄一次", async () => {
    await show({ e: "a@b.co", t: "bad" });
    expect(screen.getByText("這個試看連結無效或已失效")).toBeTruthy();
    expect(screen.getByRole("button", { name: "寄試看給我" })).toBeTruthy();
  });

  // 從官網導覽列「課程試看」點進來時沒有簽章參數，這種人不該看到「連結無效」
  it("沒帶任何參數：邀請式文案＋留信箱表單（不是「連結無效」）", async () => {
    await show(undefined);
    expect(screen.getByText("免費試看《從零開始學鋼琴》")).toBeTruthy();
    expect(screen.queryByText("這個試看連結無效或已失效")).toBeNull();
  });

  it("帶了壞掉的簽章才顯示「連結無效」", async () => {
    await show({ e: "a@b.co", t: "bad" });
    expect(screen.getByText("這個試看連結無效或已失效")).toBeTruthy();
  });
});
