// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
const api = vi.fn();
vi.mock("@/lib/admin-client", () => ({ adminFetch: (...a) => api(...a) }));
import OpsAssistantPage from "./OpsAssistantPage";
afterEach(cleanup); beforeEach(() => vi.clearAllMocks());
const report = { headline: "穩", highlights: ["付款 8 筆"], risks: [{ level: "high", text: "2 位未開通" }], suggestions: [{ title: "去開通", why: "等課", admin_path: "orders" }], metrics: { paid: 8 } };
const row = { id: "r1", period_start: "2026-09-06T16:00:00Z", period_end: "2026-09-13T16:00:00Z", triggered_by: "cron", report, model: "claude-opus-5", input_tokens: 30000, output_tokens: 2000, cost_usd: 0.2, created_at: "2026-09-13T16:05:00Z" };

describe("OpsAssistantPage", () => {
  it("有報告：顯示總結、重點、風險、建議按鈕可導到後台頁、成本註腳", async () => {
    api.mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: [row], configured: true }) });
    const onNavigate = vi.fn();
    render(<OpsAssistantPage onNavigate={onNavigate} />);
    expect(await screen.findByText("穩")).toBeTruthy();
    expect(screen.getByText("付款 8 筆")).toBeTruthy();
    expect(screen.getByText(/2 位未開通/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /訂單管理/ }));
    expect(onNavigate).toHaveBeenCalledWith("orders");
    expect(screen.getByText(/claude-opus-5/)).toBeTruthy();
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
