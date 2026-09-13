// @vitest-environment jsdom
// 「寄送成效」區的冒煙測試：展開／載入中／錯誤／空狀態／正常列都要真的渲染得出來。
// （2026-09-02 開課當晚曾因播放頁 ReferenceError 整頁崩潰，新頁面一律補整區渲染測試。）
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
const api = vi.fn();
vi.mock("@/lib/admin-client", () => ({ adminFetch: (...a) => api(...a) }));
import NewsletterPage from "./NewsletterPage";

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const STATS = {
  ok: true, from: "2026-08-15", to: "2026-09-13", brevoConfigured: true, brevoError: null, truncated: false, tagSince: "2026-09-13",
  data: [{
    key: "2026-09-02|九月電子報", subject: "九月電子報", kind: "newsletter", dateTW: "2026-09-02",
    sentCount: 68, failedCount: 2, recipientCount: 68, taggable: false,
    stats: { delivered: 66, opened: 20, proxyOpened: 11, openedAll: 31, clicked: 7, bounced: 1, unsubscribed: 1, openRate: 20 / 66, openRateAll: 31 / 66, clickRate: 7 / 66 },
  }],
};
// 基本載入（草稿／Brevo 範本／額度）一律空回應，測試只關心成效區
const routeApi = (statsRes) => (url) => {
  if (url.includes("email-stats")) return Promise.resolve(statsRes);
  if (url.includes("newsletter")) return Promise.resolve(ok({ data: {} }));
  return Promise.resolve(ok({ ok: false }));
};
const expand = () => fireEvent.click(screen.getByRole("button", { name: "展開" }));

describe("電子報「寄送成效」", () => {
  it("預設收合，不會自己打 email-stats", async () => {
    api.mockImplementation(routeApi(ok(STATS)));
    render(<NewsletterPage showToast={vi.fn()} />);
    await screen.findByRole("button", { name: "展開" });
    expect(api.mock.calls.some(([u]) => u.includes("email-stats"))).toBe(false);
  });

  it("展開後列出每次群發的寄出／送達／開信人數與百分比，代理載入另計", async () => {
    api.mockImplementation(routeApi(ok(STATS)));
    render(<NewsletterPage showToast={vi.fn()} />);
    await screen.findByRole("button", { name: "展開" });
    expand();

    await screen.findByText("九月電子報");
    const row = screen.getByText("九月電子報").closest("tr");
    expect(row.textContent).toContain("68");          // 寄出
    expect(row.textContent).toContain("2 未寄出");     // 失敗
    expect(row.textContent).toContain("66");          // 送達
    expect(row.textContent).toContain("30.3%");       // 開信率 20/66
    expect(row.textContent).toContain("11");          // 代理載入
    expect(row.textContent).toContain("10.6%");       // 點擊率 7/66
    // 沒有 tag 的舊資料要標星號並附說明
    expect(row.querySelector('[title*="只能以收件人名單比對推算"]')).toBeTruthy();
    // 日期區間由後端回填
    expect(document.querySelector('input[title="開始日期"]').value).toBe("2026-08-15");
  });

  it("載入失敗顯示「載入失敗」＋原因，不會假裝成沒有資料", async () => {
    api.mockImplementation(routeApi({ ok: false, status: 400, json: async () => ({ error: "range_too_long" }) }));
    render(<NewsletterPage showToast={vi.fn()} />);
    await screen.findByRole("button", { name: "展開" });
    expand();

    await screen.findByText("載入失敗");
    expect(screen.getByText(/超過 Brevo 上限 90 天/)).toBeTruthy();
    expect(screen.queryByText("這段期間沒有群發紀錄")).toBeNull();
  });

  it("沒有群發紀錄顯示空狀態", async () => {
    api.mockImplementation(routeApi(ok({ ...STATS, data: [] })));
    render(<NewsletterPage showToast={vi.fn()} />);
    await screen.findByRole("button", { name: "展開" });
    expand();
    await screen.findByText("這段期間沒有群發紀錄");
  });

  it("金鑰未設：提示要設 BREVO_API_KEY，開信欄顯示「—」", async () => {
    const noKey = { ...STATS, brevoConfigured: false, data: [{ ...STATS.data[0], stats: null }] };
    api.mockImplementation(routeApi(ok(noKey)));
    render(<NewsletterPage showToast={vi.fn()} />);
    await screen.findByRole("button", { name: "展開" });
    expand();

    await screen.findByText(/尚未設定 BREVO_API_KEY/);
    const row = screen.getByText("九月電子報").closest("tr");
    expect(row.textContent).toContain("68");
    expect(row.textContent).toContain("—");
  });

  it("Brevo 讀取失敗：顯示失敗原因，寄出數仍在", async () => {
    const errRes = { ...STATS, brevoError: "brevo_unreachable", data: [{ ...STATS.data[0], stats: null }] };
    api.mockImplementation(routeApi(ok(errRes)));
    render(<NewsletterPage showToast={vi.fn()} />);
    await screen.findByRole("button", { name: "展開" });
    expand();
    await screen.findByText(/brevo_unreachable/);
    expect(screen.getByText("九月電子報")).toBeTruthy();
  });

  it("按「查詢」會帶日期重查", async () => {
    api.mockImplementation(routeApi(ok(STATS)));
    render(<NewsletterPage showToast={vi.fn()} />);
    await screen.findByRole("button", { name: "展開" });
    expand();
    await screen.findByText("九月電子報");

    fireEvent.click(screen.getByRole("button", { name: "查詢" }));
    await waitFor(() => {
      const urls = api.mock.calls.map(([u]) => u).filter((u) => u.includes("email-stats"));
      expect(urls.at(-1)).toContain("from=2026-08-15");
      expect(urls.at(-1)).toContain("to=2026-09-13");
    });
  });
});
