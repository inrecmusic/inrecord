"use client";
import { useState, useEffect } from "react";
import styles from "./BuyModal.module.css";
import { MOBILE_BARCODE_RE, TAX_ID_RE, MOBILE_CARRIER_TYPE, isValidTaxId } from "@/lib/invoice-fields";

const COUPON_ERRORS = {
  coupon_not_found:   "查無此優惠碼",
  coupon_inactive:    "優惠碼已停用",
  coupon_not_started: "優惠碼尚未開始",
  coupon_expired:     "優惠碼已過期",
  coupon_used_up:     "優惠碼已達使用上限",
};

// checkout 失敗時對使用者顯示的友善文案（不洩露系統設定細節）
const CHECKOUT_ERRORS = {
  invalid_plan:         "方案資料有誤，請重新整理後再試。",
  invalid_email:        "Email 格式不正確，請確認登入帳號。",
  amount_too_low:       "金額異常，請重新整理後再試。",
  invalid_tax_id:       "統一編號格式不正確，請確認後再試。",
  tax_id_not_exist:     "查無此統一編號，請確認後再試。",
  missing_company_name: "請填寫公司抬頭。",
  invalid_carrier_type: "載具類型不正確，請重新選擇。",
  invalid_carrier_id:   "手機條碼載具格式不正確，請確認後再試。",
  carrier_not_exist:    "查無此手機條碼載具，請確認後再試。",
  missing_payuni_config: "付款服務暫時無法使用，請稍後再試或與我們聯繫。",
};
function checkoutErrorMessage(code) {
  if (code && COUPON_ERRORS[code]) return COUPON_ERRORS[code];
  if (code && CHECKOUT_ERRORS[code]) return CHECKOUT_ERRORS[code];
  return "付款服務暫時無法使用，請稍後再試或與我們聯繫。";
}

export default function BuyModal({ open, onClose, plan, email, pricing }) {
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [invoiceType, setInvoiceType] = useState("email"); // email | mobile | company
  const [carrierId, setCarrierId]     = useState("");       // 手機條碼
  const [taxId, setTaxId]             = useState("");       // 公司統編
  const [companyName, setCompanyName] = useState("");       // 公司抬頭
  const [verifying, setVerifying]     = useState(false);    // 載具/統編即時驗證中
  const [verifyError, setVerifyError] = useState("");
  const [couponInput, setCouponInput]       = useState("");
  const [couponApplied, setCouponApplied]   = useState(null); // 驗證通過的優惠券
  const [couponMsg, setCouponMsg]           = useState("");
  const [couponChecking, setCouponChecking] = useState(false);

  // 切換方案時清除已套用的優惠券（折扣與方案綁定）
  useEffect(() => { setCouponApplied(null); setCouponInput(""); setCouponMsg(""); }, [plan?.plan]);

  if (!open || !plan) return null;

  // 早鳥/原價：由首頁 sale 設定傳入（pricing）；未傳入時退回方案靜態價。
  const basePrice = pricing?.price ?? plan.price;          // 當下實收基準價（早鳥或原價），優惠券疊加於此
  const listPrice = pricing?.originalPrice ?? plan.price;  // 原價（早鳥時顯示刪除線）
  const earlyBird = !!pricing?.isEarlyBird;

  async function applyCouponCode() {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponChecking(true); setCouponMsg("");
    try {
      const r = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, plan: plan.plan }),
      });
      const d = await r.json();
      if (d.valid) setCouponApplied(d);
      else setCouponMsg(COUPON_ERRORS[d.error] || "優惠碼無效");
    } catch { setCouponMsg("驗證失敗，請稍後再試"); }
    finally { setCouponChecking(false); }
  }
  function removeCoupon() { setCouponApplied(null); setCouponInput(""); setCouponMsg(""); }

  function validateInvoice() {
    if (invoiceType === "mobile") {
      const v = carrierId.trim().toUpperCase();
      if (!MOBILE_BARCODE_RE.test(v)) return "手機條碼格式錯誤，需為斜線開頭加 7 碼（例：/ABC+123）";
    }
    if (invoiceType === "company") {
      const id = taxId.trim();
      if (!TAX_ID_RE.test(id)) return "統一編號需為 8 位數字";
      if (!isValidTaxId(id)) return "統一編號檢查碼錯誤，請確認是否輸入正確";
      if (!companyName.trim()) return "請輸入公司抬頭";
    }
    return "";
  }

  // 呼叫後端即時驗證載具/統編是否真實存在；回傳 true=可繼續（含 degraded 放行）
  async function verifyInvoiceField() {
    setVerifyError("");
    let type, value;
    if (invoiceType === "mobile")       { type = "mobile";  value = carrierId.trim().toUpperCase(); }
    else if (invoiceType === "company") { type = "company"; value = taxId.trim(); }
    else return true; // email 載具不需驗
    setVerifying(true);
    try {
      const res = await fetch("/api/invoice/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, value }),
      });
      const d = await res.json();
      if (d.valid === false) {
        setVerifyError(type === "mobile" ? "查無此手機條碼，請確認後重新輸入" : "查無此統一編號，請確認後重新輸入");
        return false;
      }
      if (type === "company" && d.name) setCompanyName(d.name); // 自動帶公司名
      return true;
    } catch {
      return true; // 前端驗證失敗不擋（後端 checkout 會再驗）
    } finally {
      setVerifying(false);
    }
  }

  async function handleCheckout() {
    if (!email) { window.location.href = "/classroom/login"; return; }

    const invalid = validateInvoice();
    if (invalid) { setError("⚠️ " + invalid); return; }

    const ok = await verifyInvoiceField();
    if (!ok) return; // verifyError 已設，畫面顯示紅字

    setLoading(true);
    setError("");

    // 依發票開立方式組合參數
    const invoiceFields = {};
    if (invoiceType === "mobile") {
      invoiceFields.carrierType = MOBILE_CARRIER_TYPE;
      invoiceFields.carrierId   = carrierId.trim().toUpperCase();
    } else if (invoiceType === "company") {
      invoiceFields.buyerTaxId = taxId.trim();
      invoiceFields.buyerName  = companyName.trim();
    }

    try {
      const res = await fetch("/api/payuni/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: plan.plan, price: basePrice, label: plan.label, email, couponCode: couponApplied?.code || undefined, ...invoiceFields }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "checkout_failed");

      const form = document.createElement("form");
      form.method = "POST";
      form.action = data.url;
      Object.entries(data.fields).forEach(([name, value]) => {
        const input = document.createElement("input");
        input.type  = "hidden";
        input.name  = name;
        input.value = value;
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      console.error("[payuni checkout]", err);
      setError(checkoutErrorMessage(err.message));
      setLoading(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div className={styles.box} role="dialog" aria-modal="true">
        <button className={styles.close} onClick={onClose}>×</button>

        <div className={styles.sheetBody}>
          <h2>確認購買方案</h2>
          <p className={styles.sub}>零基礎流行鋼琴入門課</p>

          <div className={styles.planCard}>
            <div>
              <strong>{plan.label}</strong>
              <span className={styles.desc}>{plan.desc}</span>
            </div>
            <div className={styles.price}>
              {couponApplied
                ? <><span style={{ textDecoration: "line-through", opacity: .5, fontSize: ".62em", marginRight: 6, fontWeight: 600 }}>NT${Number(basePrice).toLocaleString()}</span>NT${Number(couponApplied.finalPrice).toLocaleString()}</>
                : earlyBird
                  ? <><span style={{ textDecoration: "line-through", opacity: .5, fontSize: ".62em", marginRight: 6, fontWeight: 600 }}>NT${Number(listPrice).toLocaleString()}</span>NT${Number(basePrice).toLocaleString()}</>
                  : <>NT${Number(basePrice).toLocaleString()}</>}
              {earlyBird && !couponApplied && <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#D4192C", wordBreak: "keep-all", lineBreak: "strict", marginTop: 2 }}>早鳥優惠</span>}
            </div>
          </div>

          <div className={styles.couponRow}>
            <input
              className={styles.couponInput}
              type="text"
              placeholder="輸入優惠碼（選填）"
              value={couponInput}
              disabled={!!couponApplied}
              onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponMsg(""); }}
              onKeyDown={e => { if (e.key === "Enter" && !couponApplied) { e.preventDefault(); applyCouponCode(); } }}
            />
            {couponApplied
              ? <button type="button" className={styles.couponBtn} onClick={removeCoupon}>移除</button>
              : <button type="button" className={styles.couponBtn} onClick={applyCouponCode} disabled={couponChecking || !couponInput.trim()}>{couponChecking ? "驗證中…" : "套用"}</button>}
          </div>
          {couponApplied && <p className={styles.couponOk}>✅ 已套用「{couponApplied.name}」，折抵 NT${Number(couponApplied.discount).toLocaleString()}</p>}
          {couponMsg && <p className={styles.couponErr}>{couponMsg}</p>}

          {plan.features?.length > 0 && (
            <ul className={styles.features}>
              {plan.features.map(f => (
                <li key={f}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  {f}
                </li>
              ))}
            </ul>
          )}

          <div className={styles.account}>
            <span className={styles.accountLabel}>開通帳號</span>
            <span className={styles.accountEmail}>{email || "（請先登入）"}</span>
          </div>

          <div className={styles.invoiceSection}>
            <span className={styles.invoiceTitle}>發票開立方式</span>

            <label className={`${styles.invoiceOption} ${invoiceType === "email" ? styles.invoiceOptionActive : ""}`}>
              <input type="radio" name="invoiceType" value="email" checked={invoiceType === "email"} onChange={() => setInvoiceType("email")} />
              <span>
                <strong>電子信箱（推薦）</strong>
                <small>發票通知寄到 {email || "購買 Email"}</small>
              </span>
            </label>

            <label className={`${styles.invoiceOption} ${invoiceType === "mobile" ? styles.invoiceOptionActive : ""}`}>
              <input type="radio" name="invoiceType" value="mobile" checked={invoiceType === "mobile"} onChange={() => setInvoiceType("mobile")} />
              <span>
                <strong>手機條碼</strong>
                <small>存入手機條碼載具</small>
              </span>
            </label>
            {invoiceType === "mobile" && (
              <input
                className={styles.invoiceInput}
                type="text"
                placeholder="/ABC+123（斜線開頭 7 碼）"
                value={carrierId}
                maxLength={8}
                onChange={e => { setCarrierId(e.target.value.toUpperCase()); setVerifyError(""); }}
              />
            )}

            <label className={`${styles.invoiceOption} ${invoiceType === "company" ? styles.invoiceOptionActive : ""}`}>
              <input type="radio" name="invoiceType" value="company" checked={invoiceType === "company"} onChange={() => setInvoiceType("company")} />
              <span>
                <strong>公司統編</strong>
                <small>開立統編發票（三聯式）</small>
              </span>
            </label>
            {invoiceType === "company" && (
              <div className={styles.invoiceCompany}>
                <input
                  className={styles.invoiceInput}
                  type="text"
                  inputMode="numeric"
                  placeholder="統一編號（8 位數字）"
                  value={taxId}
                  maxLength={8}
                  onChange={e => { setTaxId(e.target.value.replace(/\D/g, "")); setVerifyError(""); }}
                />
                <input
                  className={styles.invoiceInput}
                  type="text"
                  placeholder="公司抬頭"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                />
              </div>
            )}
          </div>

          {verifyError && <p className={styles.couponErr} style={{ color: "#dc2626" }}>{verifyError}</p>}
        </div>

        <div className={styles.sheetFooter}>
          <button className={styles.proceed} onClick={handleCheckout} disabled={loading || verifying}>
            {loading ? "處理中…" : verifying ? "驗證中…" : "前往付款 →"}
          </button>
          {error && (
            <>
              <div className={styles.errorBox}>{error}</div>
              <button className={styles.retry} onClick={() => { setError(""); handleCheckout(); }}>重新嘗試</button>
            </>
          )}
          <p className={styles.note}>🔒 透過 PAYUNi 統一金流安全付款・支援信用卡、ATM、超商</p>
        </div>
      </div>
    </div>
  );
}
