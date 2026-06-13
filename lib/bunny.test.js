import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { signBunnyEmbedUrl } from "./bunny.js";

const LIB = "12345";
const KEY = "secret-token-key";
const VID = "abc-def-123";

describe("signBunnyEmbedUrl", () => {
  it("有金鑰：產生帶 token+expires 的簽名 URL，雜湊正確", () => {
    const now = 1_700_000_000_000; // 固定毫秒，便於斷言
    const url = signBunnyEmbedUrl(VID, { libraryId: LIB, tokenKey: KEY, expiresInSec: 10800, now });
    const expires = Math.floor(now / 1000) + 10800;
    const expectToken = crypto.createHash("sha256").update(KEY + VID + expires).digest("hex");
    expect(url).toContain(`/embed/${LIB}/${VID}`);
    expect(url).toContain(`token=${expectToken}`);
    expect(url).toContain(`expires=${expires}`);
    expect(expectToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it("expires = floor(now/1000) + expiresInSec", () => {
    const now = 1_700_000_500_000;
    const url = signBunnyEmbedUrl(VID, { libraryId: LIB, tokenKey: KEY, expiresInSec: 60, now });
    expect(new URL(url).searchParams.get("expires")).toBe(String(Math.floor(now / 1000) + 60));
  });

  it("無金鑰：回傳未簽名 URL（不含 token/expires）", () => {
    const url = signBunnyEmbedUrl(VID, { libraryId: LIB, tokenKey: "", now: 1 });
    expect(url).toBe(`https://iframe.mediadelivery.net/embed/${LIB}/${VID}?autoplay=false&loop=false&muted=false&preload=true`);
    expect(url).not.toContain("token=");
    expect(url).not.toContain("expires=");
  });

  it("附加預設播放參數", () => {
    const url = signBunnyEmbedUrl(VID, { libraryId: LIB, tokenKey: KEY, now: 1 });
    expect(url).toContain("autoplay=false");
    expect(url).toContain("preload=true");
  });
});
