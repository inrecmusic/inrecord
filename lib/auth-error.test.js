import { describe, it, expect } from "vitest";
import { mapAuthError, isResetSendFailure, mapResetError } from "./auth-error.js";

describe("mapAuthError（登入錯誤翻譯）", () => {
  it("帳密錯誤", () => {
    expect(mapAuthError("Invalid login credentials")).toBe("Email 或密碼錯誤");
  });
  it("信箱未驗證", () => {
    expect(mapAuthError("Email not confirmed")).toBe("信箱尚未驗證，請先到信箱點驗證連結");
  });
  it("限流類（rate limit / security purposes / after N seconds）", () => {
    expect(mapAuthError("Email rate limit exceeded")).toBe("操作太頻繁，請稍後一分鐘再試");
    expect(mapAuthError("For security purposes, you can only request this after 58 seconds.")).toBe("操作太頻繁，請稍後一分鐘再試");
  });
  it("其餘／空值 → 通用文案", () => {
    expect(mapAuthError("Something weird")).toBe("登入失敗，請稍後再試，或改用 Email 連結登入");
    expect(mapAuthError(undefined)).toBe("登入失敗，請稍後再試，或改用 Email 連結登入");
  });
});

describe("isResetSendFailure（忘記密碼寄信是否真的失敗）", () => {
  it("限流／5xx／網路錯誤 → true", () => {
    expect(isResetSendFailure("Email rate limit exceeded")).toBe(true);
    expect(isResetSendFailure("For security purposes, you can only request this after 30 seconds")).toBe(true);
    expect(isResetSendFailure("Error sending recovery email (500)")).toBe(true);
    expect(isResetSendFailure("Failed to fetch")).toBe(true);
    expect(isResetSendFailure("Network request failed")).toBe(true);
  });
  it("帳號不存在類／空值 → false（維持顯示已寄出，防枚舉）", () => {
    expect(isResetSendFailure("User not found")).toBe(false);
    expect(isResetSendFailure("")).toBe(false);
    expect(isResetSendFailure(null)).toBe(false);
  });
});

describe("mapResetError（updateUser 錯誤翻譯）", () => {
  it("與舊密碼相同", () => {
    expect(mapResetError("New password should be different from the old password.")).toBe("新密碼不能與舊密碼相同");
  });
  it("強度不足", () => {
    expect(mapResetError("Password should be at least 6 characters.")).toBe("密碼強度不足，請至少 6 個字");
    expect(mapResetError("Password is too weak")).toBe("密碼強度不足，請至少 6 個字");
  });
  it("session 失效／未登入", () => {
    expect(mapResetError("Auth session missing!")).toBe("連結已失效或登入已過期，請重新申請重設信或重新登入");
    expect(mapResetError("invalid JWT: token is expired")).toBe("連結已失效或登入已過期，請重新申請重設信或重新登入");
  });
  it("其餘 → 通用文案", () => {
    expect(mapResetError("boom")).toBe("密碼更新失敗，請稍後再試");
    expect(mapResetError()).toBe("密碼更新失敗，請稍後再試");
  });
});
