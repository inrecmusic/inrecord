"use client";
import { useState } from "react";
import { readAttributionCookie } from "@/lib/attribution";
import { trackEvent } from "@/lib/track-event";
import styles from "./LeadCapture.module.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 共用表單：首頁深色橫幅與進站彈窗都用它。勾選同意才能送 → POST /api/newsletter/subscribe
// → 進 Brevo 名單並寄「免費試看」信。成功後原地換成完成訊息並送 Lead 事件（Meta／GA4 可拿「名單」當廣告優化目標）。
// layout: "row"（輸入框＋按鈕同列）｜"stack"（直排，彈窗用）；dark：深底配色。
export function LeadForm({ layout = "row", dark = false, cta = "立即觀看試看", onDone, align = "left" }) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // { email, trialSent }
  const [msg, setMsg] = useState("");

  async function submit(e) {
    e.preventDefault();
    const value = email.trim();
    if (!consent) { setMsg("請先勾選同意，才能送出。"); return; }
    if (!EMAIL_RE.test(value)) { setMsg("Email 格式看起來不太對，請再確認一下。"); return; }
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value, consent: true, attribution: readAttributionCookie() || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) throw new Error(d.error || "failed");
      setDone({ email: value, trialSent: d.trialSent !== false, trialPath: d.trialPath || "" });
      trackEvent("Lead", { contentName: "trial" });
      onDone?.(value);
    } catch {
      setMsg("暫時無法送出，請稍後再試一次。");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    // 廣告點擊已經付過錢，不該再讓人為了看試看跑去收信——後端回了簽章連結就當場給觀看按鈕。
    // 信照樣寄（方便之後回來看），但不再是唯一入口。trialPath 缺值時退回原本的「去信箱找」文案。
    const canWatch = Boolean(done.trialPath);
    return (
      <div className={`${styles.done} ${dark ? styles.doneDark : ""}`} role="status">
        <p className={styles.doneMain}>
          {canWatch ? "試看已解鎖，現在就能看" : done.trialSent ? `試看連結已寄到 ${done.email}` : "已收到你的 Email"}
        </p>
        {canWatch && (
          <a className={styles.doneCta} href={done.trialPath}>立即觀看試看課程</a>
        )}
        {/* 收不到信是最常見的客訴來源。把「去哪找」獨立成一塊、並給出可以直接搜尋的寄件人地址， */}
        {/* 比塞在句尾的一句話有用得多。 */}
        <p className={styles.doneHint}>
          {canWatch ? (
            done.trialSent
              ? <>連結也寄到 <strong>{done.email}</strong>，之後想再看從信裡打開就行。</>
              : <>試看信暫時沒寄成，但你現在就能直接看；需要補寄請來信 <strong>support@inrecordmusic.com</strong>。</>
          ) : done.trialSent ? (
            <>沒收到嗎？請檢查<strong>促銷</strong>與<strong>垃圾郵件</strong>分頁，
              或在信箱搜尋 <strong>support@inrecordmusic.com</strong>。</>
          ) : (
            <>試看信暫時沒寄成，我們會盡快補寄；急的話直接來信 <strong>support@inrecordmusic.com</strong>。</>
          )}
        </p>
      </div>
    );
  }
  return (
    <form className={`${styles.form} ${layout === "stack" ? styles.stack : styles.row} ${dark ? styles.dark : ""} ${align === "center" ? styles.center : ""}`} onSubmit={submit} noValidate>
      <div className={styles.fields}>
        <input className={styles.input} type="email" inputMode="email" autoComplete="email" aria-label="Email"
          placeholder="你的 Email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
        <button type="submit" className={styles.btn} disabled={busy}>{busy ? "送出中…" : cta}</button>
      </div>
      <label className={styles.consent}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={busy} />
        <span><span className={styles.ph}>我同意收到 InRecord 的課程消息</span><span className={styles.ph}>與優惠通知，可隨時取消訂閱。</span><span className={styles.ph}>詳見<a href="/privacy" target="_blank" rel="noopener noreferrer">隱私權政策</a>。</span></span>
      </label>
      {msg && <p className={styles.msg} role="alert">{msg}</p>}
    </form>
  );
}

// 首頁頁尾前的深色橫幅（取代原本的「現在開始」CTA；購買入口由底部黏性購買列與方案區承接）。
export default function LeadCapture() {
  return (
    <section className={styles.section} id="subscribe" aria-labelledby="lead-title">
      <div className={styles.container}>
        <div className={styles.band}>
          <div className={styles.pic}>
            <img className={styles.mascot} src="/mascot-grand-v1.webp" alt="" width="260" height="260" loading="lazy" />
          </div>
          <div>
            <span className={styles.eyebrow}>Free Lesson</span>
            <h2 id="lead-title" className={styles.title}>免費試看課程影片，<span>再決定要不要開始</span></h2>
            <p className={styles.unit}>單元：1-2 尋找起始音 Do</p>
            <p className={styles.desc}><span className={styles.ph}>留下 Email，</span><span className={styles.ph}>馬上就能開始看。</span></p>
            <LeadForm layout="row" dark />
          </div>
        </div>
      </div>
    </section>
  );
}
