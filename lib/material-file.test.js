import { describe, it, expect } from "vitest";
import { validateMaterialFile, MATERIAL_MAX_BYTES } from "./material-file.js";

// %PDF = 0x25 0x50 0x44 0x46
const pdfHead = () => Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

describe("validateMaterialFile", () => {
  it("合法 PDF（magic + mime + 大小）→ ok, ext=pdf", () => {
    expect(validateMaterialFile(pdfHead(), "application/pdf")).toEqual({ ok: true, ext: "pdf" });
  });

  it("mime 非 application/pdf → bad_type", () => {
    expect(validateMaterialFile(pdfHead(), "image/png")).toEqual({ ok: false, error: "bad_type" });
  });

  it("mime 對但內容非 %PDF magic → bad_magic", () => {
    const notPdf = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
    expect(validateMaterialFile(notPdf, "application/pdf")).toEqual({ ok: false, error: "bad_magic" });
  });

  it("超過 4MB → too_large", () => {
    const big = new Uint8Array(MATERIAL_MAX_BYTES + 1);
    big.set(pdfHead(), 0);
    expect(validateMaterialFile(big, "application/pdf")).toEqual({ ok: false, error: "too_large" });
  });

  it("缺 bytes → bad_type", () => {
    expect(validateMaterialFile(null, "application/pdf")).toEqual({ ok: false, error: "bad_type" });
  });

  it("MATERIAL_MAX_BYTES 為 4MB", () => {
    expect(MATERIAL_MAX_BYTES).toBe(4 * 1024 * 1024);
  });

  it("剛好等於上限（4MB）+ 合法 PDF → ok（防 off-by-one）", () => {
    const atLimit = new Uint8Array(MATERIAL_MAX_BYTES);
    atLimit.set(pdfHead(), 0);
    expect(validateMaterialFile(atLimit, "application/pdf")).toEqual({ ok: true, ext: "pdf" });
  });

  it("空的 Uint8Array（長度 0）→ bad_type", () => {
    expect(validateMaterialFile(new Uint8Array(0), "application/pdf")).toEqual({ ok: false, error: "bad_type" });
  });
});
