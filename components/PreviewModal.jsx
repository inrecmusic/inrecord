"use client";
import { useState, useEffect, useRef } from "react";
import styles from "./PreviewModal.module.css";

export default function PreviewModal({ open, onClose, onSuccess }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState(null); // null | "loading" | "ok" | "error"
  const [message, setMessage] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  function isGmail(e) { return /@(gmail\.com|googlemail\.com)$/i.test(e); }
  function isValid(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

  async function handleSubmit() {
    if (!isValid(email)) { setMessage("請輸入有效的 Email 地址。"); setStatus("error"); return; }
    if (!isGmail(email)) { setMessage("請使用 Gmail（@gmail.com）。"); setStatus("error"); return; }

    setStatus("loading"); setMessage("");
    try {
      const res = await fetch("/api/brevo/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          source: "course_preview_modal",
          course: "零基礎流行鋼琴入門課",
          demoUrl: `${window.location.origin}/#courseDemo`
        })
      });
      if (!res.ok) throw new Error((await res.json()).error || "api_error");
      setStatus("ok");
      setTimeout(() => { onSuccess?.(email); onClose?.(); }, 1200);
    } catch (err) {
      // Fallback: API 未部署時仍可開啟 Demo
      setStatus("error");
      setMessage("Brevo API 尚未部署，預覽模式直接開啟 Demo。");
      setTimeout(() => { onSuccess?.(email); onClose?.(); }, 900);
    }
  }

  if (!open) return null;
  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={styles.box} role="dialog" aria-modal="true">
        <button className={styles.close} onClick={onClose}>×</button>
        <h2>體驗試看</h2>
        <p>輸入 Gmail，我們會寄送課程試看 Email，並加入試看名單。</p>
        <input
          ref={inputRef}
          className={styles.input}
          type="email"
          placeholder="your@gmail.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
          disabled={status === "loading" || status === "ok"}
        />
        <button
          className={styles.submit}
          onClick={handleSubmit}
          disabled={status === "loading" || status === "ok"}
        >
          {status === "loading" ? "寄送中…" : status === "ok" ? "✅ 已寄出！" : "寄送試看 Email"}
        </button>
        {message && <p className={`${styles.msg} ${status === "ok" ? styles.ok : styles.err}`}>{message}</p>}
        {status === "ok" && <p className={styles.success}>✅ 已寄出課程試看 Email，請到信箱收信。</p>}
        <span className={styles.note}>送出後自動加入 Brevo 名單並寄出試看 Email</span>
      </div>
    </div>
  );
}
