// lib/terms-version.js — 結帳二次確認：條款版本＋訂單摘要。
// 條款版本＝條款內文「最後更新：YYYY 年 M 月 D 日」→ "YYYY-MM-DD"。後台改條款日期即自動換版本，不另外維護。
import { DEFAULT_TERMS_MD } from "./legal-docs.js";

export function parseTermsVersion(md) {
  const m = String(md || "").match(/最後更新[：:]\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

// 伺服器端讀取（checkout 寫單、首頁傳給購買視窗顯示）：後台存過的條款優先，否則程式內建預設；任何錯誤都不丟。
export async function readTermsVersion(supabase) {
  let md = null;
  try {
    if (supabase) {
      const { data } = await supabase.from("site_content").select("body_md").eq("key", "terms").maybeSingle();
      md = data?.body_md || null;
    }
  } catch {}
  return parseTermsVersion(md) || parseTermsVersion(DEFAULT_TERMS_MD) || "unknown";
}

// 摘要文案（與服務條款 2.3／3.2 一致；改條款要同步改這裡）
export const LICENSE_TERM_TEXT = "永久有效（本平台營運存續期間），並保證自正式開課日起至少 3 年";
export const PAYMENT_METHODS_TEXT = "信用卡、ATM 轉帳、超商繳費（於付款頁選擇）";

// 第二步「確認訂單」的列（純函式）。amount＝實付金額（優惠券已套用後）。
export function buildOrderSummary({ planLabel, amount, couponCode, invoiceType, carrierId, taxId, companyName, termsVersion }) {
  const invoice = invoiceType === "mobile" ? `手機條碼載具 ${carrierId || ""}`.trim()
    : invoiceType === "company" ? `公司統編 ${taxId || ""}${companyName ? `（${companyName}）` : ""}`.trim()
    : "電子發票寄至購買 Email";
  return [
    ["課程名稱", `從零開始學鋼琴：${planLabel}`],
    ["實付價格", `NT$${Number(amount).toLocaleString("en-US")}${couponCode ? `（已套用優惠碼 ${couponCode}）` : ""}`],
    ["付款方式", PAYMENT_METHODS_TEXT],
    ["授權期間", LICENSE_TERM_TEXT],
    ["發票", invoice],
    ["服務條款版本", termsVersion || "—"],
  ];
}
