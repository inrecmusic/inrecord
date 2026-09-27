"use client";
import { useState, useEffect } from "react";
import { readAttributionCookie } from "@/lib/attribution";
import { trackEvent } from "@/lib/track-event";
import styles from "./LeadCapture.module.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 送出事件到真的跳頁之間留的緩衝（毫秒）。短到使用者只覺得「按了就開」，
// 又足夠讓 fbq／gtag 的請求離開瀏覽器（兩者都是射後不理、沒有送出回呼）。
export const REDIRECT_DELAY_MS = 500;

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

  // 成功後直接把人送進試看影片頁，不用再按一次。
  // 為什麼跳轉不會吃掉廣告訊號：廣告的優化目標是 Meta 自訂轉換，它靠 /trial 這一頁的
  // PageView（網址帶 utm_medium=lead_form）觸發——跳過去才會發生，跳得越快反而越準。
  // 首頁這顆 Lead 事件只剩參考用途，仍留 REDIRECT_DELAY_MS 的緩衝讓它盡量送得出去。
  useEffect(() => {
    const path = done?.trialPath;
    if (!path) return;
    const t = setTimeout(() => {
      // assign 而非 replace：使用者按上一頁還回得到首頁
      if (typeof window !== "undefined") window.location.assign(path);
    }, REDIRECT_DELAY_MS);
    return () => clearTimeout(t);
  }, [done]);

  if (done) {
    // 廣告點擊已經付過錢，不該再讓人為了看試看跑去收信——後端回了簽章連結就直接送進影片頁。
    // 信照樣寄（方便之後回來看），但不再是唯一入口。trialPath 缺值時退回原本的「去信箱找」文案。
    const canWatch = Boolean(done.trialPath);
    return (
      <div className={`${styles.done} ${dark ? styles.doneDark : ""}`} role="status">
        <p className={styles.doneMain}>
          {canWatch ? "試看已解鎖，正在為你開啟…" : done.trialSent ? `試看連結已寄到 ${done.email}` : "已收到你的 Email"}
        </p>
        {/* 自動跳轉的備援：被瀏覽器擋下、或使用者等不及都能直接點 */}
        {canWatch && (
          <a className={styles.doneCta} href={done.trialPath}>立即觀看試看課程</a>
        )}
        {/* 會自動跳轉時不放提示：字只閃 0.5 秒就跳走，是雜訊。
            拿不到簽章連結（不會跳）才需要指引——收不到信是最常見的客訴來源，
            把「去哪找」獨立成一塊、給出可直接搜尋的寄件人地址，比塞在句尾有用得多。 */}
        {!canWatch && (
          <p className={styles.doneHint}>
            {done.trialSent ? (
              <>沒收到嗎？請檢查<strong>促銷</strong>與<strong>垃圾郵件</strong>分頁，
                或在信箱搜尋 <strong>support@inrecordmusic.com</strong>。</>
            ) : (
              <>試看信暫時沒寄成，我們會盡快補寄；急的話直接來信 <strong>support@inrecordmusic.com</strong>。</>
            )}
          </p>
        )}
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
