// lib/material-file.js — 講義檔驗證純邏輯（僅 PDF，magic byte + 20MB）。
export const MATERIAL_MAX_BYTES = 20 * 1024 * 1024;

export function validateMaterialFile(bytes, declaredMime) {
  if (!bytes || bytes.length === 0) return { ok: false, error: "bad_type" };
  if (bytes.length > MATERIAL_MAX_BYTES) return { ok: false, error: "too_large" };
  if (declaredMime !== "application/pdf") return { ok: false, error: "bad_type" };
  // %PDF
  const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  if (!isPdf) return { ok: false, error: "bad_magic" };
  return { ok: true, ext: "pdf" };
}
