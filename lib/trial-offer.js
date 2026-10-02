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
    // 波段迄（ends_at）是「隔天 00:00、不含」；對外寫最後一分鐘（10/8 23:59 前），不寫 10/9 00:00 讓人誤以為 9 號還有。
    // nextPrice：這一波結束後的價，讓視窗能寫「10/8 23:59 前 NT$4,549，之後 NT$4,799」——沒寫截止與之後價的 CTA 沒有急迫感。
    const nextPrice = bundle.nextPrice > bundle.price ? bundle.nextPrice : null;
    return { mode: "wave", planName: PLAN_CATALOG.bundle?.label || "課程方案", price: bundle.price, originalPrice: bundle.originalPrice, nextPrice, deadlineMs: nextMs, deadlineLabel: twDeadlineLabel(nextMs - 1) };
  }
  // 波段全部結束後＝官網牌價（首頁此時也顯示牌價）。沒有截止日，所以不帶倒數。
  if (bundle.price > 0) {
    return { mode: "list", planName: PLAN_CATALOG.bundle?.label || "課程方案", price: bundle.price, originalPrice: bundle.originalPrice };
  }
  return { mode: "none" };
}
