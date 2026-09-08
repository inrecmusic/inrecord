// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import React from "react";

// next/script 在 jsdom 不會真的載腳本：mock 成掛載後立刻 onReady（或依 __scriptFails 觸發 onError）
vi.mock("next/script", () => ({
  default: function ScriptMock(props) {
    React.useEffect(() => { if (globalThis.__scriptFails) props.onError?.(new Error("blocked")); else props.onReady?.(); }, []);
    return null;
  },
}));

import GoogleSignInButton from "./GoogleSignInButton";

afterEach(() => { cleanup(); delete window.google; globalThis.__scriptFails = false; });

describe("GoogleSignInButton", () => {
  it("腳本就緒＋window.google 存在 → initialize（帶 hashed nonce）、renderButton 畫進容器、回報 ready；callback 帶出 credential 與原始 nonce", async () => {
    const initialize = vi.fn(); const renderButton = vi.fn();
    window.google = { accounts: { id: { initialize, renderButton } } };
    const onCredential = vi.fn(); const onStateChange = vi.fn();
    render(<GoogleSignInButton clientId="cid" onCredential={onCredential} onStateChange={onStateChange} />);
    await waitFor(() => expect(initialize).toHaveBeenCalled());
    const opts = initialize.mock.calls[0][0];
    expect(opts.client_id).toBe("cid");
    expect(opts.nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(renderButton.mock.calls[0][0]).toBe(screen.getByTestId("gis-button"));
    expect(onStateChange).toHaveBeenCalledWith("ready");
    opts.callback({ credential: "tok" });
    expect(onCredential).toHaveBeenCalledTimes(1);
    const arg = onCredential.mock.calls[0][0];
    expect(arg.credential).toBe("tok");
    expect(arg.nonce).toBeTypeOf("string");
    expect(arg.nonce).not.toBe(opts.nonce);
  });

  it("腳本載入失敗 → 回報 unavailable，不初始化", async () => {
    globalThis.__scriptFails = true;
    const onStateChange = vi.fn();
    render(<GoogleSignInButton clientId="cid" onCredential={vi.fn()} onStateChange={onStateChange} />);
    await waitFor(() => expect(onStateChange).toHaveBeenCalledWith("unavailable"));
  });

  it("腳本就緒但 window.google 不存在（被擴充套件擋） → 回報 unavailable", async () => {
    const onStateChange = vi.fn();
    render(<GoogleSignInButton clientId="cid" onCredential={vi.fn()} onStateChange={onStateChange} />);
    await waitFor(() => expect(onStateChange).toHaveBeenCalledWith("unavailable"));
  });
});
