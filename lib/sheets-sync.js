// lib/sheets-sync.js — 後台「同步訂單到 Google 試算表」的純資料轉換（無 I/O、無 React，可測）。
//
// 同步目標是試算表裡的專屬分頁「InRecord 訂單」，以「訂單編號」(mer_trade_no) 為唯一鍵 upsert：
// 同一筆訂單重複同步只會更新原本那一列，不會長出重複列 → 月底重跑、退款後再跑都安全，
// 也不會動到試算表裡其他分頁的既有資料。
//
// 與 Apps Script（docs/sheets/orders-sync.gs 的 doPost）的傳輸合約：
//   送出 { secret, orders: [ {…見 ORDER_FIELDS} ] }
//   回應 { ok:true, inserted, updated } 或 { ok:false, error, message }
//         ⚠️ Apps Script 一律回 HTTP 200，成功與否只能看 body 的 ok。
//   欄序與表頭由 Apps Script 端的 HEADERS/FIELDS 決定，這裡只負責把欄位名對上；
//   「同步時間」欄由 Apps Script 自己補，故不在此送出。
//   ⚠️ 改欄位＝兩邊一起改（docs/sheets/orders-sync.gs 的 HEADERS 與 FIELDS）。

// 分頁名稱（須與 Apps Script 的 SHEET_NAME 一致；只供稽核紀錄與後台文案顯示）
export const SHEET_NAME = "InRecord 訂單";

// 送出的欄位名（順序＝試算表欄序，僅供文件與測試對照）
export const ORDER_FIELDS = [
  "mer_trade_no",  // 訂單編號（upsert 唯一鍵）
  "created_at",    // 成立日期
  "paid_at",       // 付款日期
  "email",         // Email
  "name",          // 姓名
  "plan",          // 方案
  "amount",        // 金額
  "coupon_code",   // 優惠碼
  "pay_type",      // 付款方式
  "status",        // 狀態
  "invoice_no",    // 發票號碼
  "source",        // 來源
  "refunded_at",   // 退款日期
  "refund_amount", // 退款金額
];

const TW_OFFSET_MS = 8 * 3600 * 1000; // 台灣固定 UTC+8、無夏令時間
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const p2 = (n) => String(n).padStart(2, "0");

// 以 UTC 欄位表示台灣牆上時間（同 lib/ops-report/period.js 的做法）。
// 刻意不用 toLocaleString：伺服器與瀏覽器的 ICU 結果不同（分隔符／半形空白差異）。
const twParts = (d) => new Date(d.getTime() + TW_OFFSET_MS);

// 台灣日期 YYYY-MM-DD
export function twYmd(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const t = twParts(d);
  return `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}`;
}

// 台灣時間 YYYY-MM-DD HH:mm（Apps Script 端認得這個格式會原樣沿用）。
// 空值／不合法時間回空字串，讓試算表該格留白。
export function twDateTime(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const t = twParts(d);
  return `${twYmd(d)} ${p2(t.getUTCHours())}:${p2(t.getUTCMinutes())}`;
}

// 上個月整月（台灣時間）。老闆是月底／月初在登記上個月的帳，故當作預設區間。
export function lastMonthRange(now = new Date()) {
  const t = twParts(now instanceof Date ? now : new Date(now));
  const first = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1)); // 上個月 1 號
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0));      // 本月 0 號＝上個月最後一天
  const ymd = (d) => `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
  return { from: ymd(first), to: ymd(last) };
}

// 'YYYY-MM-DD' + 台灣時刻 → UTC ISO；擋掉 2026-02-31 這種會被 JS 自動進位的無效日
function isoAt(day, clock) {
  const d = new Date(`${day}T${clock}+08:00`);
  if (Number.isNaN(d.getTime())) return null;
  return twYmd(d) === day ? d.toISOString() : null;
}

// 台灣日期區間（含起訖）→ 給 PostgREST 用的 UTC ISO 邊界。
// 沿用後台日期篩選語意：空字串＝該側不設限（回 null）。不合法／起晚於訖回 null（整體失敗）。
export function twRangeToUtc(from = "", to = "") {
  const f = from || "";
  const t = to || "";
  if ((f && !DATE_RE.test(f)) || (t && !DATE_RE.test(t))) return null;
  if (f && t && f > t) return null; // 同為 YYYY-MM-DD，字串比較即日期先後
  const startIso = f ? isoAt(f, "00:00:00.000") : null;
  const endIso = t ? isoAt(t, "23:59:59.999") : null;
  if ((f && !startIso) || (t && !endIso)) return null;
  return { startIso, endIso };
}

const STATUS_LABELS = {
  paid: "已付款", pending: "待付款", refunded: "已退款", failed: "付款失敗", expired: "已逾期",
};
export const statusLabel = (s) => STATUS_LABELS[s] || s || "";

// 付款日期：orders 沒有獨立的 paid_at 欄位。
// fulfilled_at＝PAYUNi notify 付款成功時寫入的「首次履約時間」，是最接近付款完成的欄位；
// 外部來源（wordpress／concert／manual）建單時就是已付款、沒有 fulfilled_at，退回 updated_at。
// 已退款的單不退回 updated_at——那是退款當下的時間，會被誤讀成付款日。
function paidAt(o) {
  if (o.fulfilled_at) return o.fulfilled_at;
  return o.status === "paid" ? o.updated_at || "" : "";
}

// 退款日期／金額：orders 沒有 refunded_at／refund_amount 欄位，退款只把 status 改成 refunded
// 並更新 updated_at（見 app/api/admin/refund/route.js），故以 updated_at 與原金額代表。
const refundedAt = (o) => (o.status === "refunded" ? o.updated_at || "" : "");
const refundAmount = (o) => (o.status === "refunded" ? Number(o.amount) || 0 : "");

// 一筆訂單 → 一筆試算表紀錄（鍵名＝ORDER_FIELDS）。
// payLabelFn 由呼叫端注入 lib/dashboard.js 的 payLabel（付款方式對照表的單一權威來源，不另抄一份）。
export function orderToSheetRecord(order, { payLabelFn } = {}) {
  const o = order || {};
  return {
    mer_trade_no: o.mer_trade_no || "",
    created_at: twDateTime(o.created_at),
    paid_at: twDateTime(paidAt(o)),
    email: o.grant_email || o.email || "", // 開通信箱優先（購買信箱≠登入信箱時以實際開通者為準）
    name: o.buyer_name || "",
    plan: o.plan_label || o.plan || "",
    amount: Number(o.amount) || 0,
    coupon_code: o.coupon_code || "",
    pay_type: payLabelFn ? payLabelFn(o) : "",
    status: statusLabel(o.status),
    invoice_no: o.invoice_no || "",
    source: o.source || "",
    refunded_at: twDateTime(refundedAt(o)),
    refund_amount: refundAmount(o),
  };
}

// 送往 Apps Script 的完整 payload（見檔頭合約）。
// 沒有 mer_trade_no 的列會被 Apps Script 整批擋下（缺唯一鍵無法 upsert），故先濾掉：
// 正常訂單一定有編號，只有極早期或髒資料才會缺，不該讓整個月的同步失敗。
export function buildSyncPayload(orders = [], { secret, payLabelFn } = {}) {
  const records = (orders || [])
    .map((o) => orderToSheetRecord(o, { payLabelFn }))
    .filter((r) => r.mer_trade_no);
  return { secret, orders: records };
}
