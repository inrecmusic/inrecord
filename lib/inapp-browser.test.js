import { describe, it, expect } from "vitest";
import { isInAppBrowser } from "./inapp-browser.js";

describe("isInAppBrowser", () => {
  it("偵測 Instagram / Facebook / LINE / WeChat 等 App 內建瀏覽器", () => {
    expect(isInAppBrowser("Mozilla/5.0 ... Instagram 300.0.0")).toBe(true);
    expect(isInAppBrowser("Mozilla/5.0 ... [FBAN/FBIOS;FBAV/...]")).toBe(true);
    expect(isInAppBrowser("Mozilla/5.0 ... Line/13.1.0")).toBe(true);
    expect(isInAppBrowser("Mozilla/5.0 ... MicroMessenger/8.0")).toBe(true);
    expect(isInAppBrowser("Mozilla/5.0 (Linux; Android 12; wv) AppleWebKit")).toBe(true);
  });

  it("一般系統瀏覽器（Safari / Chrome）不誤判", () => {
    expect(isInAppBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605 Version/17.0 Mobile/15E148 Safari/604.1")).toBe(false);
    expect(isInAppBrowser("Mozilla/5.0 (Linux; Android 14) Chrome/120.0 Mobile Safari/537.36")).toBe(false);
  });

  it("空字串或缺 UA 回傳 false", () => {
    expect(isInAppBrowser("")).toBe(false);
  });

  it("不把含有 'online' 等字的 UA 誤判為 LINE", () => {
    expect(isInAppBrowser("Mozilla/5.0 someonline browser")).toBe(false);
  });
});
