// lib/account.js — 帳號設定純函式（可測）。

export const DISPLAY_NAME_MAX = 20;

// 驗證顯示名稱：去頭尾空白 → 空白為無效 → 超過上限為無效。
export function validateDisplayName(raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return { ok: false, error: "請輸入顯示名稱" };
  if (value.length > DISPLAY_NAME_MAX) return { ok: false, error: `顯示名稱請勿超過 ${DISPLAY_NAME_MAX} 字` };
  return { ok: true, value };
}
