// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
const api = vi.fn();
vi.mock("@/lib/admin-client", () => ({ adminFetch: (...a) => api(...a) }));
import StudentsPage from "./StudentsPage";
afterEach(cleanup); beforeEach(() => vi.clearAllMocks());

const student = { id: "s1", email: "alan@example.com", paid: true, purchased: true, status: "purchased" };

describe("StudentsPage 載入失敗不冒充空名單", () => {
  it("後端回 500：顯示錯誤與重試，不顯示「還沒有任何學員」", async () => {
    api.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: "server_error" }) });
    render(<StudentsPage showToast={vi.fn()} />);

    expect(await screen.findAllByText(/server_error/)).toBeTruthy();
    expect(screen.queryByText("還沒有任何學員")).toBeNull();
    expect(screen.getAllByRole("button", { name: "重試" }).length).toBeGreaterThan(0);
  });

  it("按重試後端恢復：錯誤消失、名單出現", async () => {
    api.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: "db_not_configured" }) })
       .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, data: [student] }) });
    render(<StudentsPage showToast={vi.fn()} />);

    fireEvent.click((await screen.findAllByRole("button", { name: "重試" }))[0]);

    await waitFor(() => expect(screen.getByText("alan@example.com")).toBeTruthy());
    expect(screen.queryByText(/db_not_configured/)).toBeNull();
  });

  it("成功但真的沒資料才顯示空狀態", async () => {
    api.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, data: [] }) });
    render(<StudentsPage showToast={vi.fn()} />);

    expect(await screen.findByText("還沒有任何學員")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "重試" })).toBeNull();
  });
});
