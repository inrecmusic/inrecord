// 優惠序號庫純邏輯：產碼 / 正規化 / CSV（無副作用，可單測）
import { randomInt } from "node:crypto";

// 排除易混字 0 O 1 I
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const MAX_BATCH_QUANTITY = 500;

// 密碼學安全亂數（回傳 [0,1)）；序號等同金錢，預設不可用可預測的 Math.random
function secureRandom() { return randomInt(0, 0x100000000) / 0x100000000; }

// 產生單一隨機碼；rng 預設 CSPRNG（測試可注入固定亂數）
export function generateCode(prefix = "", length = 8, rng = secureRandom) {
  let body = "";
  for (let i = 0; i < length; i++) {
    body += CHARS[Math.floor(rng() * CHARS.length)];
  }
  const p = String(prefix || "").trim().toUpperCase();
  return p ? `${p}-${body}` : body;
}

// 產生整批唯一碼，避開 existing（Set<string>）；碰撞重試
export function generateBatchCodes({ prefix = "", quantity, length = 8, existing = new Set(), rng = secureRandom }) {
  const n = Math.round(Number(quantity));
  if (!Number.isFinite(n) || n <= 0) throw new Error("invalid_quantity");
  if (n > MAX_BATCH_QUANTITY) throw new Error(`quantity_over_${MAX_BATCH_QUANTITY}`);
  const seen = new Set(existing);
  const out = [];
  let guard = 0;
  const maxGuard = n * 50 + 1000;
  while (out.length < n) {
    if (guard++ > maxGuard) throw new Error("code_collision");
    const code = generateCode(prefix, length, rng);
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

// 手動輸入：逐行 trim、轉大寫、去空行、去重（保序）
export function normalizeManualCodes(raw) {
  const out = [];
  const seen = new Set();
  for (const line of String(raw || "").split(/\r?\n/)) {
    const c = line.trim().toUpperCase();
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

// 輸出 CSV：序號,狀態,折扣,批次名稱
export function codesToCsv(codes, { discountLabel, batchName }) {
  const esc = (s) => {
    let v = String(s ?? "");
    // 防 CSV 公式注入：以 = + - @ Tab CR 開頭者前綴單引號並整欄加引號，避免 Excel 當公式執行
    const formula = /^[=+\-@\t\r]/.test(v);
    if (formula) v = "'" + v;
    return formula || /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const header = "序號,狀態,折扣,批次名稱";
  const rows = codes.map((c) =>
    [esc(c.code), c.used ? "已使用" : "未使用", esc(discountLabel), esc(batchName)].join(",")
  );
  return [header, ...rows].join("\n") + "\n";
}
