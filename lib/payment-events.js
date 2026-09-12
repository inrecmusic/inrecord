// lib/payment-events.js — PAYUNi 背景通知（notify）的原始回呼落地。
//
// 為什麼要有這支：notify 原本只處理「付款成功（TradeStatus=1）」，而且只把 4 個欄位寫回 orders。
// ATM／超商下單後 PAYUNi 會先送一次「取號成功」通知，裡面才有銀行代碼、虛擬帳號、繳費期限、
// 超商繳費代碼——那包資料走到檔尾就被丟掉了，事後要退 ATM 的款時查無匯款資訊。
// 這裡把每一次回呼原樣存進 payment_events.raw，未來 PAYUNi 加任何欄位也一併保存。
//
// ⚠️ 鐵則：notify 是營業命脈，這支絕不可讓它失敗。
//    任何錯誤（含資料表還沒建的 42P01）一律只記 log 後回傳，不拋出。

// 取號欄位：出現其中任何一個非空值，就代表這是 ATM／超商的「取號成功」通知。
// PAYUNi 依付款方式回不同欄位，寧可寬鬆判斷（記成 code_issued）也不要漏記。
const CODE_FIELDS = [
  "PayNo",        // 虛擬帳號／超商繳費代碼
  "BankType",     // 代收銀行代碼
  "ExpireDate",   // 繳費期限
  "BankNo",       // 部分文件用此名表示銀行代碼
  "CVSCode",      // 超商代碼
  "Barcode1", "Barcode2", "Barcode3", // 超商條碼三段
  "VirtualAccount", "AtmNo",          // 其他可能的別名
];

const str = (v) => (v == null ? null : String(v)) || null;

const isPlainObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

// 有沒有拿到任何取號資訊
function hasPaymentCode(p) {
  return CODE_FIELDS.some((k) => str(p[k]) !== null);
}

// 純函式：把解密後的回呼參數歸類成 paid / code_issued / other，並取出索引用的幾個欄位。
// TradeStatus=1（付款成功）優先；其次看有無取號欄位；其餘一律 other（含付款失敗、退款通知等）。
export function classifyEvent(params) {
  const p = isPlainObject(params) ? params : {};
  const tradeStatus = str(p.TradeStatus);
  const kind = tradeStatus === "1" ? "paid" : hasPaymentCode(p) ? "code_issued" : "other";
  return {
    kind,
    merTradeNo: str(p.MerTradeNo),
    payuniTradeNo: str(p.TradeNo),
    tradeStatus,
    payType: str(p.PaymentType) ?? str(p.PayType),
  };
}

// 落地一列 payment_events（整包 params 原樣進 raw）。失敗只記 log，絕不拋出。
// 回傳 { ok } 供測試／呼叫端參考，呼叫端不需要（也不該）依它決定主流程。
export async function recordPaymentEvent(supabase, params) {
  try {
    if (!supabase) return { ok: false, error: "no_supabase" };
    const e = classifyEvent(params);
    const { error } = await supabase.from("payment_events").insert({
      mer_trade_no: e.merTradeNo,
      payuni_trade_no: e.payuniTradeNo,
      trade_status: e.tradeStatus,
      pay_type: e.payType,
      kind: e.kind,
      raw: isPlainObject(params) ? params : {},
    });
    if (error) {
      // 42P01＝資料表不存在（supabase-payment-events.sql 還沒跑）。付款流程照常，只是沒留底。
      const hint = error.code === "42P01" ? "（payment_events 表不存在，請執行 supabase-payment-events.sql）" : "";
      console.error("[payment event] 寫入失敗（不影響付款流程）", e.merTradeNo, error.message || error.code, hint);
      return { ok: false, error: error.message || error.code || "insert_failed" };
    }
    return { ok: true };
  } catch (err) {
    console.error("[payment event] 寫入例外（不影響付款流程）", err?.message || err);
    return { ok: false, error: err?.message || "threw" };
  }
}
