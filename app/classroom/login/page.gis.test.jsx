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
import { supabase } from "@/lib/supabase";

afterEach(() => { cleanup(); vi.clearAllMocks(); lastProps = null; vi.unstubAllEnvs(); });

// 密碼登入／忘記密碼：Supabase 英文錯誤不能直出（lib/auth-error 翻譯；限流／SMTP 失敗不能假裝已寄出）
describe("登入頁錯誤文案", () => {
  function fillEmail(email = "a@b.com") {
    fireEvent.change(screen.getByLabelText("電子信箱"), { target: { value: email } });
  }
  async function submitPassword() {
    fillEmail();
    fireEvent.change(screen.getByLabelText("密碼"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "登入" }));
  }

  it("Email not confirmed → 翻成繁中，不直出英文", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "");
    supabase.auth.signInWithPassword.mockResolvedValue({ error: { message: "Email not confirmed" } });
    render(<ClassroomLoginPage />);
    await submitPassword();
    expect(await screen.findByText("信箱尚未驗證，請先到信箱點驗證連結")).toBeTruthy();
    expect(screen.queryByText(/not confirmed/)).toBeNull();
  });

  it("限流（For security purposes… after N seconds）→ 操作太頻繁", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "");
    supabase.auth.signInWithPassword.mockResolvedValue({ error: { message: "For security purposes, you can only request this after 42 seconds." } });
    render(<ClassroomLoginPage />);
    await submitPassword();
    expect(await screen.findByText("操作太頻繁，請稍後一分鐘再試")).toBeTruthy();
  });

  it("忘記密碼：resetPasswordForEmail 回限流 error → 顯示錯誤、不顯示已寄出", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "");
    supabase.auth.resetPasswordForEmail.mockResolvedValue({ error: { message: "Email rate limit exceeded" } });
    render(<ClassroomLoginPage />);
    fillEmail();
    fireEvent.click(screen.getByRole("button", { name: "忘記密碼？" }));
    expect(await screen.findByText("寄送太頻繁或系統忙碌，請稍後再試")).toBeTruthy();
    expect(screen.queryByText(/重設密碼信已寄出/)).toBeNull();
  });

  it("忘記密碼：其他 error（帳號不存在類）仍顯示已寄出（防枚舉）", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "");
    supabase.auth.resetPasswordForEmail.mockResolvedValue({ error: { message: "User not found" } });
    render(<ClassroomLoginPage />);
    fillEmail();
    fireEvent.click(screen.getByRole("button", { name: "忘記密碼？" }));
    expect(await screen.findByText(/重設密碼信已寄出/)).toBeTruthy();
  });
});

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
