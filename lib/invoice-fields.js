// 發票欄位格式驗證（前後端共用單一來源；後端不信任前端，仍會各自再驗一次）

// 手機條碼載具格式：斜線開頭 + 7 碼（大寫英數與 . + -）
export const MOBILE_BARCODE_RE = /^\/[0-9A-Z.+-]{7}$/;
// 統一編號：8 位數字
export const TAX_ID_RE = /^\d{8}$/;
// Amego 手機條碼載具代碼
export const MOBILE_CARRIER_TYPE = "3J0002";

// 統一編號檢查碼驗證（財政部 2023 新制：加權積和可被 5 整除；第 7 碼為 7 時有 +1 例外）
export function isValidTaxId(id) {
  if (!TAX_ID_RE.test(id) || id === "00000000") return false;
  const weights = [1, 2, 1, 2, 1, 2, 4, 1];
  const digits = id.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    const product = digits[i] * weights[i];
    sum += Math.floor(product / 10) + (product % 10);
  }
  if (sum % 5 === 0) return true;
  return digits[6] === 7 && (sum + 1) % 5 === 0;
}

// 手機條碼載具格式驗證（呼叫端負責先轉大寫）
export function isValidMobileBarcode(barcode) {
  return MOBILE_BARCODE_RE.test(barcode);
}
