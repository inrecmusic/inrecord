"use client";
import { useState } from "react";
import styles from "./BuyModal.module.css";

const PLAN_DESCS = {
  fan1: "有購買專輯、音樂會資格",
  fan2: "有購買樂譜資格",
  early1: "第一波早鳥價格",
  early2: "第二波早鳥價格",
  early3: "最後早鳥價格",
  full: "原價方案"
};

export default function BuyModal({ open, onClose, plan }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open || !plan) return null;

  async function handleCheckout() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: plan.plan, price: plan.price, label: plan.label })
      });
      if (!res.ok) throw new Error((await res.json()).error || "checkout_failed");
      const { url } = await res.json();
      if (url) { window.location.href = url; return; }
      throw new Error("no_url");
    } catch (err) {
      setError("⚠️ Stripe 後端尚未部署，請先在 Vercel 設定 STRIPE_SECRET_KEY 與 STRIPE_PRICE_ID_* 環境變數，並部署 api/stripe/checkout。");
    } finally { setLoading(false); }
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
            <span className={styles.desc}>{PLAN_DESCS[plan.plan]}</span>
          </div>
          <div className={styles.price}>NT${Number(plan.price).toLocaleString()}</div>
        </div>
        <button className={styles.proceed} onClick={handleCheckout} disabled={loading}>
          {loading ? "處理中…" : "前往 Stripe 結帳 →"}
        </button>
        {error && <div className={styles.errorBox}>{error}</div>}
        <p className={styles.note}>🔒 透過 Stripe 安全付款・支援信用卡、Apple Pay、Google Pay</p>
      </div>
    </div>
  );
}
