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

// ── 信用卡明細（分期期數／卡號末四碼／授權碼）──────────────────────────────
// ⚠️ 前提：PAYUNi 回呼裡這三個欄位的「實際名稱」我們還沒用真實資料驗證過。
//    所以這裡不押單一欄位名，而是給每項一組候選名（大小寫、底線一律忽略），
//    並把「實際命中的原始 key（含巢狀路徑）」記進 matchedKeys——
//    真單進來時就能對照確認猜對沒有，也才有辦法在後台誠實顯示「找不到分期欄位」。
//    ⚠️ 找不到 ≠ 一次付清，兩者一定要分得出來，否則會報出假的「0 筆分期」。

// 候選名＝已正規化（全小寫、只留英數）。陣列順序＝優先序，愈前面愈明確。
const CARD_KEYS = {
  // ⚠️ 刻意不收 period／periods／auth 這種太泛的名字：會命中定期定額的 Period 或不相干欄位，
  // 產生一個「取自欄位 Period」看起來很可信的假期數。PAYUNi 既有 Card4No／Card6No 的命名習慣，
  // 分期較可能叫 CardInst 一類，先補進來；仍以真單核對為準。
  installment: [
    "installment", "installmentperiod", "installmentperiods", "installments",
    "instalment", "instalmentperiod", "cardinst", "cardinstallment", "instnum",
    "inst", "instperiod", "instcount", "creditinst",
  ],
  last4: [
    "card4no", "card4", "cardlast4", "last4", "cardno4", "cardnolast4",
    "last4digits", "cardtail", "cardend",
  ],
  firstAmt: ["firstamt", "firstamount", "instfirstamt"],
  eachAmt: ["eachamt", "eachamount", "insteachamt", "peramt"],
  authCode: [
    "authcode", "approvalcode", "authorizationcode", "creditauthcode",
    "approveno", "authno", "approvalno",
  ],
};

// key 正規化：大小寫、底線、連字號、空白一律不計（Card_4No / card4no / CARD-4-NO 視為同一個）
const normKey = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, "");

// 走訪整包 raw（含巢狀物件／陣列），回傳「正規化 key → { path, value }」。
// 廣度優先＝同名時淺層優先；空值（null／""）不算命中；有節點數與深度上限，不怕髒資料或循環參照。
function flattenKeys(raw) {
  const found = new Map();
  const seen = new Set();
  let budget = 500;
  const queue = [[raw, "", 0]];
  while (queue.length && budget > 0) {
    const [node, prefix, depth] = queue.shift();
    if (!node || typeof node !== "object" || seen.has(node) || depth > 5) continue;
    seen.add(node);
    for (const [k, v] of Object.entries(node)) {
      if (budget-- <= 0) break;
      const path = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object") { queue.push([v, path, depth + 1]); continue; }
      const nk = normKey(k);
      if (nk && !found.has(nk) && str(v) !== null) found.set(nk, { path, value: v });
    }
  }
  return found;
}

// 期數正規化："3" / 3 / "03" / "3期" → 3；"0"（一次付清）／""／非數字 → null
// 期數：回三態，UI 才分得出「一次付清」「看不懂的值」「根本沒欄位」，不會把不確定講成事實。
//   { state:"n", n }         純數字且在合理區間（1–36）
//   { state:"none" }         0／1＝一次付清（真單核對 2026-09-14：PAYUNi CardInst='1' 時 FirstAmt＝總額、EachAmt='0'）
//   { state:"unparsable", raw }  有值但不是純數字或超出區間（"3期(每期1000)"、"NA"、"null"、日期…）
//   null                     空值（"", null, undefined）＝視同沒有這個欄位
export const INSTALLMENT_MAX = 36;
function toInstallment(v) {
  if (v == null) return null;
  const str = String(v).trim();
  if (str === "") return null;
  if (!/^\d{1,3}$/.test(str)) return { state: "unparsable", raw: str };
  const n = Number(str);
  if (n === 0 || n === 1) return { state: "none" };
  if (n >= 2 && n <= INSTALLMENT_MAX) return { state: "n", n };
  return { state: "unparsable", raw: str };
}

// 末四碼正規化：純數字取最後四碼（遮罩卡號 424242******4242 也適用）；不足四碼就原樣回傳
function toLast4(v) {
  const digits = String(v ?? "").replace(/\D/g, "");
  if (digits.length >= 4) return digits.slice(-4);
  return digits || null;
}

const blankCardInfo = () => ({
  installment: null, installmentState: "missing", installmentRaw: null, last4: null, authCode: null,
  firstAmt: null, eachAmt: null,
  matchedKeys: { installment: null, last4: null, authCode: null },
});

// 純函式：從一筆回呼的 raw 取出信用卡明細。絕不拋出（raw 非物件／null／巢狀都安全）。
// 回傳 matchedKeys：實際命中的原始 key（巢狀以 a.b 表示），沒命中為 null。
// installment 為 null 有兩種意思，要靠 matchedKeys.installment 分辨：
//   有 key → 該欄位是 0／空，代表一次付清；沒 key → 我們根本沒在回呼裡找到分期欄位。
export function extractCardInfo(raw) {
  try {
    if (!isPlainObject(raw)) return blankCardInfo();
    const found = flattenKeys(raw);
    const pick = (names) => { for (const n of names) { const hit = found.get(n); if (hit) return hit; } return null; };
    const inst = pick(CARD_KEYS.installment);
    const last4 = pick(CARD_KEYS.last4);
    const auth = pick(CARD_KEYS.authCode);
    const first = pick(CARD_KEYS.firstAmt);
    const each = pick(CARD_KEYS.eachAmt);
    const toAmt = (v) => { const n = Number(String(v ?? "").replace(/[^\d.]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };
    const instParsed = inst ? toInstallment(inst.value) : null;
    return {
      // installment：只有純數字 1–36 才給數字；其餘一律 null，由 installmentState 說明原因
      installment: instParsed?.state === "n" ? instParsed.n : null,
      // installmentState：n｜none（一次付清）｜unparsable（有值但看不懂）｜missing（沒找到欄位或是空值）
      installmentState: instParsed?.state ?? "missing",
      installmentRaw: instParsed?.state === "unparsable" ? instParsed.raw : null,
      last4: toLast4(last4?.value),
      authCode: auth ? String(auth.value).trim() || null : null,
      firstAmt: toAmt(first?.value),
      eachAmt: toAmt(each?.value),
      matchedKeys: {
        installment: inst?.path ?? null,
        last4: last4?.path ?? null,
        authCode: auth?.path ?? null,
      },
    };
  } catch {
    return blankCardInfo();
  }
}

// ── 付款方式與非信用卡的明細 ───────────────────────────────────────────────
// 後台的「付款明細」原本只認信用卡欄位，ATM／超商單會整排顯示「回呼中沒有」「找不到分期欄位」，
// 看起來像壞掉——其實是這種付款方式本來就沒有卡片資料。改成先判斷付款方式，再顯示對應欄位。
//
// PaymentType 為 PAYUNi 回呼帶的付款方式代碼；代碼對不上時退回看 Message 的中文，
// 兩者都認不出就回 unknown（顯示原始值，不亂猜）。
const PAY_TYPE_CODE = { 1: "credit", 2: "atm", 3: "cvs", 4: "cvs" };
export const PAY_TYPE_LABEL = { credit: "信用卡", atm: "ATM 轉帳", cvs: "超商代碼", unknown: "未知" };

// 台灣金融機構代碼（常見者）。查不到就顯示代碼本身，不猜。
const BANK_NAME = {
  "004": "臺灣銀行", "005": "土地銀行", "006": "合作金庫", "007": "第一銀行", "008": "華南銀行",
  "009": "彰化銀行", "011": "上海商銀", "012": "台北富邦", "013": "國泰世華", "017": "兆豐銀行",
  "021": "花旗銀行", "050": "台灣企銀", "052": "渣打銀行", "053": "台中銀行", "081": "匯豐銀行",
  "103": "新光銀行", "108": "陽信銀行", "118": "板信銀行", "700": "中華郵政", "803": "聯邦銀行",
  "805": "遠東銀行", "806": "元大銀行", "807": "永豐銀行", "808": "玉山銀行", "809": "凱基銀行",
  "812": "台新銀行", "816": "安泰銀行", "822": "中國信託",
};
export function bankLabel(code) {
  const c = String(code ?? "").trim();
  if (!c) return null;
  const key = c.padStart(3, "0");
  return BANK_NAME[key] ? `${BANK_NAME[key]}（${key}）` : key;
}

export function paymentKind(raw) {
  if (!isPlainObject(raw)) return "unknown";
  const code = Number(String(raw.PaymentType ?? "").trim());
  if (PAY_TYPE_CODE[code]) return PAY_TYPE_CODE[code];
  const msg = String(raw.Message ?? "");
  if (/ATM|轉帳/i.test(msg)) return "atm";
  if (/超商|代碼|條碼/.test(msg)) return "cvs";
  if (/信用卡|刷卡/.test(msg)) return "credit";
  return "unknown";
}

// ATM／超商的明細。events 傳整串回呼：繳費期限只在「取號」那筆，繳費結果在「付款成功」那筆。
export function extractTransferInfo(events = []) {
  const list = Array.isArray(events) ? events : [];
  const rawOf = (e) => (isPlainObject(e?.raw) ? e.raw : {});
  const paid = list.find((e) => e?.kind === "paid" || String(e?.trade_status) === "1");
  const issued = list.find((e) => e?.kind === "code_issued" || String(e?.trade_status) === "0");
  const p = rawOf(paid), i = rawOf(issued);
  const str = (v) => { const t = String(v ?? "").trim(); return t && t !== "-" ? t : null; };
  return {
    kind: paymentKind(p) !== "unknown" ? paymentKind(p) : paymentKind(i),
    payNo: str(p.PayNo) || str(i.PayNo),                       // 虛擬帳號／超商繳費代碼
    bank: bankLabel(str(p.PayBank) || str(i.BankType)),        // 取號銀行／實際繳款行
    fromAccount5: str(p.Account5No),                           // 轉出帳號末五碼
    paidAt: str(p.PayTime),
    expireAt: str(i.ExpireDate),
  };
}
