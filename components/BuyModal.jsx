"use client";
import { useState, useEffect } from "react";
import styles from "./BuyModal.module.css";

const COUPON_ERRORS = {
  coupon_not_found:   "查無此優惠碼",
  coupon_inactive:    "優惠碼已停用",
  coupon_not_started: "優惠碼尚未開始",
  coupon_expired:     "優惠碼已過期",
  coupon_used_up:     "優惠碼已達使用上限",
};

// 手機條碼載具格式：斜線開頭 + 7 碼（大寫英數與 . + -）
const MOBILE_BARCODE_RE = /^\/[0-9A-Z.+-]{7}$/;
// 統一編號：8 位數字
const TAX_ID_RE = /^\d{8}$/;
// Amego 手機條碼載具代碼
const MOBILE_CARRIER_TYPE = "3J0002";

// 統一編號檢查碼驗證（財政部 2023 新制：sum 可被 5 整除；第 7 碼為 7 時有 +1 例外）
function isValidTaxId(id) {
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

export default function BuyModal({ open, onClose, plan, email }) {
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [invoiceType, setInvoiceType] = useState("email"); // email | mobile | company
  const [carrierId, setCarrierId]     = useState("");       // 手機條碼
  const [taxId, setTaxId]             = useState("");       // 公司統編
  const [companyName, setCompanyName] = useState("");       // 公司抬頭
  const [couponInput, setCouponInput]       = useState("");
  const [couponApplied, setCouponApplied]   = useState(null); // 驗證通過的優惠券
  const [couponMsg, setCouponMsg]           = useState("");
  const [couponChecking, setCouponChecking] = useState(false);

  // 切換方案時清除已套用的優惠券（折扣與方案綁定）
  useEffect(() => { setCouponApplied(null); setCouponInput(""); setCouponMsg(""); }, [plan?.plan]);

  if (!open || !plan) return null;

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

  async function handleCheckout() {
    if (!email) { window.location.href = "/classroom/login"; return; }

    const invalid = validateInvoice();
    if (invalid) { setError("⚠️ " + invalid); return; }

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
        body: JSON.stringify({ plan: plan.plan, price: plan.price, label: plan.label, email, couponCode: couponApplied?.code || undefined, ...invoiceFields }),
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
      setError("⚠️ 金流服務尚未設定，請確認 Payuni 環境變數（PAYUNI_MERCHANT_ID、PAYUNI_HASH_KEY、PAYUNI_HASH_IV）已在 Vercel 設定。");
      setLoading(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div className={styles.box} role="dialog" aria-modal="true">
        <button className={styles.close} onClick={onClose}>×</button>
        <h2>確認購買方案</h2>
        <p className={styles.sub}>零基礎流行鋼琴入門課</p>

        <div className={styles.planCard}>
          <div>
            <strong>{plan.label}</strong>
            <span className={styles.desc}>{plan.desc}</span>
          </div>
          <div className={styles.price}>
            {couponApplied
              ? <><span style={{ textDecoration: "line-through", opacity: .5, fontSize: ".62em", marginRight: 6, fontWeight: 600 }}>NT${Number(plan.price).toLocaleString()}</span>NT${Number(couponApplied.finalPrice).toLocaleString()}</>
              : <>NT${Number(plan.price).toLocaleString()}</>}
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
              onChange={e => setCarrierId(e.target.value.toUpperCase())}
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
                onChange={e => setTaxId(e.target.value.replace(/\D/g, ""))}
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

        <button className={styles.proceed} onClick={handleCheckout} disabled={loading}>
          {loading ? "處理中…" : "前往付款 →"}
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
  );
}
