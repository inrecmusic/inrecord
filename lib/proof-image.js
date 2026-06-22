// 憑證圖驗證：純邏輯（JPEG/PNG magic-byte + 5MB）。
const MAX = 5 * 1024 * 1024;

export function validateProofImage(bytes, declaredMime) {
  if (!bytes) return { ok: false, error: "bad_type" };
  if (bytes.length > MAX) return { ok: false, error: "too_large" };
  if (declaredMime !== "image/jpeg" && declaredMime !== "image/png") {
    return { ok: false, error: "bad_type" };
  }
  const isJpeg = bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
  if (declaredMime === "image/jpeg" && !isJpeg) return { ok: false, error: "bad_magic" };
  if (declaredMime === "image/png" && !isPng) return { ok: false, error: "bad_magic" };
  return { ok: true, ext: isJpeg ? "jpg" : "png" };
}
