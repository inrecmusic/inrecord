// @vitest-environment jsdom
// 訂單管理是後台最關鍵的頁面（營收、開通、退款、對帳都在這），但先前零元件測試覆蓋。
// 2026-09-02 開課當晚就是整頁 ReferenceError 崩潰的事故，所以這裡先釘住「頁面渲染得出來、
// 既有功能區塊都還在」，再加上新的試算表同步按鈕的啟用／停用行為。
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

const api = vi.fn();
vi.mock("@/lib/admin-client", () => ({ adminFetch: (...a) => api(...a) }));

import OrdersPage from "./OrdersPage";

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const ORDER = {
  id: "o1",
  email: "alan@example.com",
  plan: "bundle",
  plan_label: "學琴全攻略",
  amount: 3999,
  status: "paid",
  source: "payuni",
  pay_type: "1",
  mer_trade_no: "INREC1788000000000",
  created_at: "2026-09-01T02:00:00.000Z",
  updated_at: "2026-09-01T02:05:00.000Z",
  enrolled: true,
};

// 這頁進場會打兩支：/api/admin/orders 與 /api/admin/sheets-sync（讀設定狀態）
function mockApi({ orders = [ORDER], ordersOk = true, sheets = { configured: false } } = {}) {
  api.mockImplementation((path) => {
    if (path.startsWith("/api/admin/orders")) {
      return Promise.resolve({
        ok: ordersOk,
        status: ordersOk ? 200 : 500,
        json: async () => (ordersOk ? { ok: true, data: orders } : { error: "server_error" }),
      });
    }
    if (path.startsWith("/api/admin/sheets-sync")) {
      return Promise.resolve({ ok: true, status: 200, json: async () => sheets });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });
}

describe("OrdersPage 基本渲染", () => {
  it("整頁渲染不拋錯，既有功能區塊都還在", async () => {
    mockApi();
    render(<OrdersPage showToast={vi.fn()} />);

    // 訂單資料到齊
    expect(await screen.findByText(/alan@example\.com/)).toBeTruthy();
    // 既有的對帳彙整與匯出仍在（新按鈕不得取代它們）
    expect(screen.getByText(/匯出對帳 CSV/)).toBeTruthy();
    // 手動開通表單仍在
    expect(screen.getAllByText(/手動開通/).length).toBeGreaterThan(0);
  });

  it("訂單載入失敗不冒充「沒有訂單」", async () => {
    mockApi({ ordersOk: false });
    render(<OrdersPage showToast={vi.fn()} />);

    // 失敗時要顯示錯誤與重試，不可出現「等待第一筆購買」這種把故障講成沒生意的文案
    expect(await screen.findByText(/載入訂單失敗/)).toBeTruthy();
    expect(screen.queryByText(/等待第一筆購買/)).toBeNull();
    expect(screen.getAllByRole("button", { name: "重試" }).length).toBeGreaterThan(0);
  });
});

describe("Google 試算表同步按鈕", () => {
  it("環境變數未設時按鈕停用，並說明原因", async () => {
    mockApi({ sheets: { configured: false } });
    render(<OrdersPage showToast={vi.fn()} />);

    const btn = await screen.findByRole("button", { name: /同步到 Google 試算表/ });
    expect(btn.disabled).toBe(true);
  });

  it("環境變數設好後按鈕可按", async () => {
    mockApi({ sheets: { configured: true, sheet: "InRecord 訂單", from: "2026-08-01", to: "2026-08-31" } });
    render(<OrdersPage showToast={vi.fn()} />);

    const btn = await screen.findByRole("button", { name: /同步到 Google 試算表/ });
    await waitFor(() => expect(btn.disabled).toBe(false));
  });
});
