// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
const api = vi.fn();
vi.mock("@/lib/admin-client", () => ({ adminFetch: (...a) => api(...a) }));
import OpsAssistantPage from "./OpsAssistantPage";
afterEach(cleanup); beforeEach(() => vi.clearAllMocks());
const report = {
  headline: "穩", highlights: ["付款 8 筆", "重點二", "重點三", "第四條不該出現"],
  risks: [{ level: "high", text: "2 位未開通" }, { level: "medium", text: "中等風險不顯示" }],
  suggestions: [{ title: "去開通", why: "舊欄位不顯示", admin_path: "orders" }],
  metrics: { paid: 8, "本週退款": 0 },
  core: { revenue: { this_week: 34392, last_week: 22195 }, paid_orders: { this_week: 8, last_week: 5 }, created_orders: { this_week: 9, last_week: 9 }, active_students: { this_week: 14, last_week: null }, ad_spend: { this_week: 813, last_week: 0 }, newsletter_sent: { this_week: 0, last_week: 2 } },
};
const row = { id: "r1", period_start: "2026-09-06T16:00:00Z", period_end: "2026-09-13T16:00:00Z", triggered_by: "cron", report, model: "claude-opus-5-5", input_tokens: 30000, output_tokens: 2000, cost_usd: 0.2, created_at: "2026-09-13T16:05:00Z" };

describe("OpsAssistantPage", () => {
  it("有報告：總結、核心指標本週／上週表、重點最多 3、只顯示 high 風險、建議只有做什麼＋前往鈕、更多數字摺疊、成本註腳", async () => {
    api.mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: [row], configured: true }) });
    const onNavigate = vi.fn();
    render(<OpsAssistantPage onNavigate={onNavigate} />);
    expect(await screen.findByText("穩")).toBeTruthy();
    // 核心指標表
    expect(screen.getByText("核心指標")).toBeTruthy();
    expect(screen.getByText("NT$34,392")).toBeTruthy();
    expect(screen.getByText("NT$22,195")).toBeTruthy();
    expect(screen.getByText("活躍學員")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();   // 上週活躍 null → —
    // 重點裁到 3
    expect(screen.getByText("付款 8 筆")).toBeTruthy();
    expect(screen.getByText("重點三")).toBeTruthy();
    expect(screen.queryByText("第四條不該出現")).toBeNull();
    // 風險只留 high
    expect(screen.getByText(/2 位未開通/)).toBeTruthy();
    expect(screen.queryByText(/中等風險不顯示/)).toBeNull();
    // 建議：做什麼＋前往，不印 why
    expect(screen.getByText("去開通")).toBeTruthy();
    expect(screen.queryByText(/舊欄位不顯示/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /訂單管理/ }));
    expect(onNavigate).toHaveBeenCalledWith("orders");
    // 更多數字摺疊
    expect(screen.getByText(/更多數字（2 項）/)).toBeTruthy();
    expect(screen.getByText("本週退款")).toBeTruthy();
    expect(screen.getByText(/claude-opus-5-5/)).toBeTruthy();
  });
  it("舊報告沒有 core：不畫核心指標表，其餘照常", async () => {
    const old = { ...row, id: "r0", report: { headline: "舊", highlights: ["h"], risks: [], suggestions: [], metrics: { paid: 1 } } };
    api.mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: [old], configured: true }) });
    render(<OpsAssistantPage />);
    expect(await screen.findByText("舊")).toBeTruthy();
    expect(screen.queryByText("核心指標")).toBeNull();
    expect(screen.getByText(/更多數字（1 項）/)).toBeTruthy();
  });
  it("未設 API key：說明文字、按鈕停用", async () => {
    api.mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: [], configured: false }) });
    render(<OpsAssistantPage />);
    expect(await screen.findByText(/尚未設定 ANTHROPIC_API_KEY/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /立刻產生/ }).disabled).toBe(true);
  });
  it("立刻產生：POST run 後把新報告放到最前面", async () => {
    api.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, data: [], configured: true }) })
       .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, data: { ...row, id: "r2", triggered_by: "manual" } }) });
    render(<OpsAssistantPage showToast={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /立刻產生/ }));
    await waitFor(() => expect(screen.getByText("穩")).toBeTruthy());
    expect(api.mock.calls[1][0]).toBe("/api/admin/ops-report/run");
  });
});
