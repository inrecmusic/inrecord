import { describe, it, expect } from "vitest";
import { validateProofImage } from "./proof-image.js";

const jpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0x00, 0x11]);
const png = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x00]);

describe("validateProofImage", () => {
  it("合法 JPEG", () => {
    expect(validateProofImage(jpeg, "image/jpeg")).toEqual({ ok: true, ext: "jpg" });
  });
  it("合法 PNG", () => {
    expect(validateProofImage(png, "image/png")).toEqual({ ok: true, ext: "png" });
  });
  it("超過 5MB → too_large", () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(jpeg);
    expect(validateProofImage(big, "image/jpeg")).toMatchObject({ ok: false, error: "too_large" });
  });
  it("非圖片型別 → bad_type", () => {
    expect(validateProofImage(jpeg, "application/pdf")).toMatchObject({ ok: false, error: "bad_type" });
  });
  it("型別與 magic 不符 → bad_magic", () => {
    expect(validateProofImage(png, "image/jpeg")).toMatchObject({ ok: false, error: "bad_magic" });
  });
  it("null 輸入 → bad_type", () => {
    expect(validateProofImage(null, "image/jpeg")).toMatchObject({ ok: false, error: "bad_type" });
  });
  it("空陣列（長度 0）→ bad_magic", () => {
    expect(validateProofImage(new Uint8Array(0), "image/jpeg")).toMatchObject({ ok: false, error: "bad_magic" });
  });
});
