"use client";
import { useState } from "react";
import { readAttributionCookie } from "@/lib/attribution";
import { trackEvent } from "@/lib/track-event";
import styles from "./LeadCapture.module.css";

// 首頁「留下 Email」：給看完還沒決定的人。勾選同意才能送出 → POST /api/newsletter/subscribe → Brevo 潛客清單。
// 成功後原地換成完成訊息，並送 Lead 事件（Meta／GA4 之後可拿「名單」當廣告優化目標）。
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LeadCapture() {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState("idle"); // idle | loading | done
  const [msg, setMsg] = useState("");

  async function submit(e) {
    e.preventDefault();
    const value = email.trim();
    if (!consent) { setMsg("請先勾選同意，才能送出。"); return; }
    if (!EMAIL_RE.test(value)) { setMsg("Email 格式看起來不太對，請再確認一下。"); return; }
    setState("loading"); setMsg("");
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value, consent: true, attribution: readAttributionCookie() || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) throw new Error(d.error || "failed");
      setState("done");
      trackEvent("Lead", { contentName: "newsletter" });
    } catch {
      setState("idle");
      setMsg("暫時無法送出，請稍後再試一次。");
    }
  }

  const busy = state === "loading";
  return (
    <section className={styles.section} id="subscribe" aria-labelledby="lead-title">
      <div className={styles.container}>
        <div className={styles.card}>
          <span className={styles.eyebrow}>還沒準備好購買？</span>
          <h2 id="lead-title" className={styles.title}>留下 Email，新章節與優惠第一時間通知你</h2>
          <p className={styles.desc}>不用急著決定。新章節上架、限時優惠或免費內容一有消息就寄信告訴你，隨時可以取消。</p>
          {state === "done" ? (
            <p className={styles.done} role="status">已訂閱！有新章節或優惠時，會第一時間寄信通知你。</p>
          ) : (
            <form className={styles.form} onSubmit={submit} noValidate>
              <div className={styles.row}>
                <input className={styles.input} type="email" inputMode="email" autoComplete="email" aria-label="Email"
                  placeholder="你的 Email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
                <button type="submit" className={styles.btn} disabled={busy}>{busy ? "送出中…" : "通知我"}</button>
              </div>
              <label className={styles.consent}>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={busy} />
                <span>我同意收到 InRecord 的課程消息與優惠通知，可隨時取消訂閱。詳見<a href="/privacy" target="_blank" rel="noopener noreferrer">隱私權政策</a>。</span>
              </label>
              {msg && <p className={styles.msg} role="alert">{msg}</p>}
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
