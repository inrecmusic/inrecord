"use client";
import { useState, useCallback } from "react";
import styles from "./BuyModal.module.css";

const PLAN_DESCS = {
  fan1:   "提供專輯、演奏會購買憑證即可享有優惠資格",
  fan2:   "提供樂譜購買憑證即可享有優惠資格",
  early1: "限量名額，課程上線初期最低優惠",
  early2: "第二波早鳥價格",
  early3: "最後早鳥價格",
  full:   "原價方案",
};

const FAN_PLANS = new Set(["fan1", "fan2"]);

export default function BuyModal({ open, onClose, plan }) {
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [proofFile, setProofFile]   = useState(null);
  const [proofPreview, setProofPreview] = useState(null);
  const [dragOver, setDragOver]     = useState(false);

  if (!open || !plan) return null;

  const isFanPlan = FAN_PLANS.has(plan.plan);

  function pickFile(file) {
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setError("請上傳 JPG 或 PNG 格式的圖片");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("圖片大小不得超過 10MB");
      return;
    }
    setError("");
    setProofFile(file);
    setProofPreview(URL.createObjectURL(file));
  }

  function handleFileInput(e) { pickFile(e.target.files?.[0]); }
  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    pickFile(e.dataTransfer.files?.[0]);
  }
  function removeFile() { setProofFile(null); setProofPreview(null); }

  async function handleCheckout() {
    setLoading(true);
    setError("");

    let proofUrl = null;
    if (isFanPlan && proofFile) {
      try {
        const fd = new FormData();
        fd.append("file", proofFile);
        const upRes = await fetch("/api/upload-proof", { method: "POST", body: fd });
        const upData = await upRes.json();
        if (upData.url) proofUrl = upData.url;
      } catch {
        // non-fatal — proceed anyway, admin can follow up
      }
    }

    try {
      const res = await fetch("/api/payuni/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: plan.plan, price: plan.price, label: plan.label, proofUrl }),
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

  const canProceed = !loading && (!isFanPlan || proofFile !== null);

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

        {isFanPlan && (
          <div className={styles.uploadSection}>
            <p className={styles.uploadLabel}>上傳購買憑證 <span className={styles.uploadRequired}>*必填</span></p>
            {proofPreview ? (
              <div className={styles.uploadPreview}>
                <img src={proofPreview} alt="憑證預覽" />
                <button className={styles.uploadRemove} type="button" onClick={removeFile}>重新上傳</button>
              </div>
            ) : (
              <label
                className={`${styles.uploadArea} ${dragOver ? styles.uploadAreaOver : ""}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <input type="file" accept="image/jpeg,image/png" onChange={handleFileInput} hidden />
                <span className={styles.uploadIcon}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                </span>
                <span className={styles.uploadText}>點擊選擇或拖曳圖片</span>
                <span className={styles.uploadHint}>支援 JPG、PNG，最大 10MB</span>
              </label>
            )}
          </div>
        )}

        <button className={styles.proceed} onClick={handleCheckout} disabled={!canProceed}>
          {loading ? "處理中…" : "前往付款 →"}
        </button>
        {isFanPlan && !proofFile && !error && (
          <p className={styles.uploadNotice}>請先上傳購買憑證，審核通過後即可開通課程</p>
        )}
        {error && <div className={styles.errorBox}>{error}</div>}
        <p className={styles.note}>🔒 透過 Payuni 統一金流安全付款・支援信用卡、ATM、超商</p>
      </div>
    </div>
  );
}
