"use client";
import { useState } from "react";
import styles from "./BuyModal.module.css";

export default function BuyModal({ open, onClose, plan, email }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  if (!open || !plan) return null;

  async function handleCheckout() {
    if (!email) { window.location.href = "/classroom/login"; return; }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/payuni/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: plan.plan, price: plan.price, label: plan.label, email }),
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
          <div className={styles.price}>NT${Number(plan.price).toLocaleString()}</div>
        </div>

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
