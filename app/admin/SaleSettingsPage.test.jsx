// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
const api = vi.fn();
vi.mock("@/lib/admin-client", () => ({ adminFetch: (...a) => api(...a) }));
import SaleSettingsPage from "./SaleSettingsPage";
afterEach(cleanup); beforeEach(() => vi.clearAllMocks());

const okJson = (data) => ({ ok: true, status: 200, json: async () => ({ data }) });
const settings = { open_at: "2026-09-02T12:00:00Z", lock_override: null, launch_notified_at: null, list_price: { bundle: 3999 }, list_anchor: {}, waves: [], fan_plan: {} };

// 路由：sale-settings 依情境回應，其餘（TrialVideoPanel 的 site-content）一律成功空資料
const route = (saleRes) => async (url) => (url.startsWith("/api/admin/sale-settings") ? saleRes() : okJson({}));

describe("SaleSettingsPage 載入失敗守門", () => {
  it("後端回 500：不渲染表單（沒有開課日／波段／寄開課通知），只顯示錯誤與重試", async () => {
    api.mockImplementation(route(() => ({ ok: false, status: 500, json: async () => ({ error: "server_error" }) })));
    render(<SaleSettingsPage showToast={vi.fn()} />);

    expect(await screen.findByText(/載入失敗/)).toBeTruthy();
    expect(screen.queryByText(/開課日（解鎖教室）/)).toBeNull();
    expect(screen.queryByText(/早鳥波段/)).toBeNull();
    expect(screen.queryByRole("button", { name: /立即寄送開課通知/ })).toBeNull();
    expect(screen.getByRole("button", { name: "重試" })).toBeTruthy();
  });

  it("按重試後端恢復：表單與儲存按鈕才出現", async () => {
    let fail = true;
    api.mockImplementation(route(() => (fail ? { ok: false, status: 503, json: async () => ({ error: "db_not_configured" }) } : okJson(settings))));
    render(<SaleSettingsPage showToast={vi.fn()} />);

    const retry = await screen.findByRole("button", { name: "重試" });
    fail = false; // 後端恢復
    fireEvent.click(retry);

    await waitFor(() => expect(screen.getByText(/開課日（解鎖教室）/)).toBeTruthy());
    expect(screen.queryByText(/載入失敗/)).toBeNull();
    expect(screen.getByRole("button", { name: /立即寄送開課通知/ })).toBeTruthy();
  });

  it("成功但尚無資料列（新環境）：照舊給空白表單可建立設定", async () => {
    api.mockImplementation(route(() => okJson(null)));
    render(<SaleSettingsPage showToast={vi.fn()} />);

    expect(await screen.findByText(/開課日（解鎖教室）/)).toBeTruthy();
  });
});
