// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/inapp-browser", () => ({ isInAppBrowser: () => false }));
const signInWithIdToken = vi.fn(); const signInWithOAuth = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { signInWithIdToken: (...a) => signInWithIdToken(...a), signInWithOAuth: (...a) => signInWithOAuth(...a), signInWithPassword: vi.fn(), signInWithOtp: vi.fn(), verifyOtp: vi.fn(), resetPasswordForEmail: vi.fn() } } }));
// 用假的 GoogleSignInButton 直接控制狀態與 callback
let lastProps = null;
vi.mock("@/components/GoogleSignInButton", () => ({ default: (props) => { lastProps = props; return <div data-testid="gis" />; } }));

import ClassroomLoginPage from "./page";

afterEach(() => { cleanup(); vi.clearAllMocks(); lastProps = null; vi.unstubAllEnvs(); });

describe("登入頁 Google 登入（GIS）", () => {
  it("有 NEXT_PUBLIC_GOOGLE_CLIENT_ID → 顯示 GIS 元件而非舊按鈕；credential 回來後用 signInWithIdToken（帶原始 nonce）並導向 /classroom", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "cid");
    signInWithIdToken.mockResolvedValue({ error: null });
    render(<ClassroomLoginPage />);
    expect(screen.getByTestId("gis")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /使用 Google 登入/ })).toBeNull();
    expect(lastProps.clientId).toBe("cid");
    await lastProps.onCredential({ credential: "tok", nonce: "raw" });
    expect(signInWithIdToken).toHaveBeenCalledWith({ provider: "google", token: "tok", nonce: "raw" });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/classroom"));
  });

  it("signInWithIdToken 失敗 → 顯示錯誤，並退回舊的 Google 網頁登入按鈕", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "cid");
    signInWithIdToken.mockResolvedValue({ error: { message: "bad audience" } });
    render(<ClassroomLoginPage />);
    await lastProps.onCredential({ credential: "tok", nonce: "raw" });
    expect(await screen.findByText(/Google 登入暫時無法使用/)).toBeTruthy();
    const fallback = screen.getByRole("button", { name: /Google 網頁登入/ });
    fireEvent.click(fallback);
    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalled());
  });

  it("GIS 回報 unavailable → 顯示舊按鈕", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "cid");
    render(<ClassroomLoginPage />);
    lastProps.onStateChange("unavailable");
    expect(await screen.findByRole("button", { name: /Google 網頁登入/ })).toBeTruthy();
  });

  it("沒有 NEXT_PUBLIC_GOOGLE_CLIENT_ID → 只有舊按鈕，不掛 GIS", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "");
    render(<ClassroomLoginPage />);
    expect(screen.queryByTestId("gis")).toBeNull();
    expect(screen.getByRole("button", { name: /使用 Google 登入/ })).toBeTruthy();
  });
});
