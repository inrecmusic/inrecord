// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
const api = vi.fn();
vi.mock("@/lib/admin-client", () => ({ adminFetch: (...a) => api(...a) }));
import TrackingSettingsPage from "./TrackingSettingsPage";
afterEach(cleanup); beforeEach(() => vi.clearAllMocks());

const config = { meta: { id: "123456", enabled: true }, ga4: { id: "G-ABC", enabled: true } };

describe("TrackingSettingsPage 載入失敗守門", () => {
  it("後端回 500：不渲染表單（沒有 Pixel 欄位與儲存鈕），只顯示錯誤與重試", async () => {
    api.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: "server_error" }) });
    render(<TrackingSettingsPage showToast={vi.fn()} />);

    expect(await screen.findByText(/載入失敗/)).toBeTruthy();
    expect(screen.queryByText(/Meta \/ Facebook Pixel/)).toBeNull();
    expect(screen.queryByRole("button", { name: "儲存" })).toBeNull();
    expect(screen.getByRole("button", { name: "重試" })).toBeTruthy();
  });

  it("按重試後端恢復：表單帶回既有追蹤碼，儲存鈕才出現", async () => {
    api.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: "db_not_configured" }) })
       .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: config }) });
    render(<TrackingSettingsPage showToast={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "重試" }));

    await waitFor(() => expect(screen.getByDisplayValue("123456")).toBeTruthy());
    expect(screen.getByRole("button", { name: "儲存" })).toBeTruthy();
  });

  it("成功但尚未設定過：照舊給空白表單可填寫", async () => {
    api.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: {} }) });
    render(<TrackingSettingsPage showToast={vi.fn()} />);

    expect(await screen.findByText(/Meta \/ Facebook Pixel/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "儲存" })).toBeTruthy();
  });
});
