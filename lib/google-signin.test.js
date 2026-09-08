import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import { generateNonce, initGoogleButton, GIS_SCRIPT_SRC } from "./google-signin.js";

describe("google-signin", () => {
  it("generateNonce：nonce 為 base64、hashedNonce 為其 SHA-256 十六進位（64 字元），每次不同", async () => {
    const a = await generateNonce();
    const b = await generateNonce();
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.hashedNonce).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hashedNonce).toBe(createHash("sha256").update(a.nonce).digest("hex"));
    expect(Buffer.from(a.nonce, "base64")).toHaveLength(32);
  });

  it("initGoogleButton：以 client_id＋hashed nonce＋FedCM 初始化，並在指定元素畫標準按鈕；callback 帶出 credential", () => {
    const initialize = vi.fn(); const renderButton = vi.fn();
    const google = { accounts: { id: { initialize, renderButton } } };
    const el = {}; const onCredential = vi.fn();
    initGoogleButton(google, el, { clientId: "cid", hashedNonce: "abc", onCredential, width: 300 });
    expect(initialize).toHaveBeenCalledTimes(1);
    const opts = initialize.mock.calls[0][0];
    expect(opts).toMatchObject({ client_id: "cid", nonce: "abc", use_fedcm_for_prompt: true, ux_mode: "popup" });
    expect(renderButton).toHaveBeenCalledWith(el, expect.objectContaining({ type: "standard", shape: "pill", size: "large", width: 300, locale: "zh_TW" }));
    opts.callback({ credential: "tok" });
    expect(onCredential).toHaveBeenCalledWith("tok");
    opts.callback({});
    expect(onCredential).toHaveBeenCalledTimes(1);
  });

  it("GIS_SCRIPT_SRC 是 Google 官方腳本網址", () => {
    expect(GIS_SCRIPT_SRC).toBe("https://accounts.google.com/gsi/client");
  });
});
