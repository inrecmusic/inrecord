// lib/newsletter-vars.js — 電子報內文的動態數字（純函式）。
//
// 為什麼要這個：波段倒數那類信每次都要改價格、改日期、改剩幾天。手改遲早會忘、
// 或把上一波的數字寄出去——對已經看過官網的人來說那是很糟的錯誤。
// 改成寄出當下由 sale_settings 現算，草稿只寫佔位符，永遠不會過期。
//
// 佔位符刻意用中文，讓非工程背景的人在後台編輯時看得懂自己在寫什麼。
import { currentPrice, listAnchor, activeWave, getFanPlan } from "./sale.js";

const nt = (n) => "NT$" + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const TW = "+08:00";

// 台灣時間的「M 月 D 日」；波段結束時間存的是「隔天 00:00」（結束時間不含），
// 對外要講的是「到 D 日截止」，所以顯示時往前退一毫秒再取日期。
function twDateLabel(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  const d = new Date(t - 1 + 8 * 3600 * 1000);
  return `${d.getUTCMonth() + 1} 月 ${d.getUTCDate()} 日`;
}

// 距離 iso（波段結束）還有幾天：不足一天顯示「不到 1」，讓文案不會寫成「剩 0 天」。
function daysLeftLabel(iso, nowMs) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  const ms = t - nowMs;
  if (ms <= 0) return "0";
  const d = Math.floor(ms / 86400000);
  return d >= 1 ? String(d) : "不到 1";
}

// 下一段的售價：目前波段結束後接手的那一段；沒有下一段就是牌價。
export function nextPriceAfter(settings, plan = "bundle", nowMs = Date.now()) {
  const w = activeWave(settings, new Date(nowMs));
  if (!w) return null;
  const after = Date.parse(w.ends_at);
  const ws = (Array.isArray(settings?.waves) ? settings.waves : [])
    .filter((x) => x && x.starts_at && x.ends_at)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const next = ws.find((x) => Date.parse(x.starts_at) >= after);
  const p = next?.prices?.[plan];
  return Number.isFinite(p) ? p : listAnchor(plan, settings);
}

// 支援的佔位符（後台編輯時看得懂；未知的原樣保留，不會把內文吃掉）
export function saleVars(settings, { plan = "bundle", nowMs = Date.now() } = {}) {
  const now = new Date(nowMs);
  const w = activeWave(settings, now);
  const fan = getFanPlan(settings);
  const next = nextPriceAfter(settings, plan, nowMs);
  return {
    "目前售價": nt(currentPrice(plan, settings, now)),
    "原價": nt(listAnchor(plan, settings)),
    "下次售價": next == null ? "" : nt(next),
    "調漲日期": w ? twDateLabel(new Date(Date.parse(w.ends_at) + 1).toISOString()) : "",
    "截止日期": w ? twDateLabel(w.ends_at) : "",
    "剩餘天數": w ? daysLeftLabel(w.ends_at, nowMs) : "",
    "憑證折抵": nt(fan.proofDiscount),
    "憑證價": nt(Math.max(0, currentPrice(plan, settings, now) - fan.proofDiscount)),
  };
}

// 把 {{佔位符}} 換成當下的數字。沒有 settings（讀取失敗）時原樣回傳，
// 寧可讓編輯者看到佔位符也不要寄出錯誤金額。
export function substituteSaleVars(md, settings, opts = {}) {
  if (typeof md !== "string" || !md) return md;
  if (!settings) return md;
  const vars = saleVars(settings, opts);
  return md.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (full, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : full
  );
}
