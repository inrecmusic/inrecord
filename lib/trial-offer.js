// 試看頁導購視窗要顯示的價格與倒數，三態：粉絲方案還開著／粉絲已截止但在波段中／都不符（不顯示價格）。
// 全部取自 salePhase()，一個數字都不寫死；讀不到設定就 fail-closed 回 none，寧可不報價也不報錯價。

// 台灣時區的「M/D HH:MM」。用 formatToParts 自己組，避開 Node 與瀏覽器 ICU 的空白差異。
export function twDeadlineLabel(ms) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(ms).map((p) => [p.type, p.value])
  );
  return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

import { PLAN_CATALOG } from "./plans.js";

export function trialOffer(sale) {
  const bundle = sale?.plans?.bundle;
  if (!bundle) return { mode: "none" };
  const fan = sale.fanPlan;
  if (fan?.enabled && fan.deadlineMs > 0 && fan.directPrice > 0) {
    return { mode: "fan", planName: "粉絲方案", price: fan.directPrice, originalPrice: bundle.originalPrice, deadlineMs: fan.deadlineMs, deadlineLabel: twDeadlineLabel(fan.deadlineMs) };
  }
  const nextMs = sale.nextIncreaseAt ? Date.parse(sale.nextIncreaseAt) : NaN;
  if (sale.state === "wave" && Number.isFinite(nextMs)) {
    return { mode: "wave", planName: PLAN_CATALOG.bundle?.label || "課程方案", price: bundle.price, originalPrice: bundle.originalPrice, deadlineMs: nextMs, deadlineLabel: twDeadlineLabel(nextMs) };
  }
  // 波段全部結束後＝官網牌價（首頁此時也顯示牌價）。沒有截止日，所以不帶倒數。
  if (bundle.price > 0) {
    return { mode: "list", planName: PLAN_CATALOG.bundle?.label || "課程方案", price: bundle.price, originalPrice: bundle.originalPrice };
  }
  return { mode: "none" };
}
