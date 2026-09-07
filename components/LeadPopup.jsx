"use client";
import { useCallback, useEffect, useState } from "react";
import { LeadForm } from "./LeadCapture";
import styles from "./LeadPopup.module.css";

// 進站彈窗（只掛首頁）：停留 delayMs 或捲到 scrollRatio 才出現。關掉 7 天內不再彈；已留過信箱（DONE_KEY）或已登入不彈。
// 規則抽成 shouldShowPopup 純函式方便測試；storage 可注入（預設 localStorage，讀寫都 try/catch）。
// 網址帶 ?lead=1 → 無視記號、立刻顯示（後台／設計檢查用；一般訪客不會帶）。
export const DISMISS_KEY = "ir_lead_dismissed_at";
export const DONE_KEY = "ir_lead_done";
const DISMISS_DAYS = 7;

export function shouldShowPopup({ loggedIn, storage, now = Date.now(), force = false }) {
  if (force) return true;
  if (loggedIn) return false;
  try {
    if (storage?.getItem(DONE_KEY)) return false;
    const at = Number(storage?.getItem(DISMISS_KEY) || 0);
    if (at && now - at < DISMISS_DAYS * 86400e3) return false;
  } catch {}
  return true;
}

function safeStorage() { try { return window.localStorage; } catch { return null; } }
function forcedByQuery() { try { return new URLSearchParams(window.location.search).get("lead") === "1"; } catch { return false; } }

export default function LeadPopup({ loggedIn = false, storage, delayMs = 6000, scrollRatio = 0.5 }) {
  const [open, setOpen] = useState(false);
  const [fired, setFired] = useState(false);
  const store = storage || safeStorage();

  useEffect(() => {
    const force = forcedByQuery();
    if (fired || !shouldShowPopup({ loggedIn, storage: store, force })) return;
    let timer = null;
    const cleanup = () => { if (timer) clearTimeout(timer); window.removeEventListener("scroll", onScroll); };
    const show = () => { cleanup(); setFired(true); setOpen(true); };
    function onScroll() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max > 0 && window.scrollY >= max * scrollRatio) show();
    }
    timer = setTimeout(show, force ? 0 : delayMs);
    window.addEventListener("scroll", onScroll, { passive: true });
    return cleanup;
  }, [loggedIn, store, delayMs, scrollRatio, fired]);

  const close = useCallback(() => {
    setOpen(false);
    try { store?.setItem(DISMISS_KEY, String(Date.now())); } catch {}
  }, [store]);
  const onDone = useCallback(() => { try { store?.setItem(DONE_KEY, "1"); } catch {} }, [store]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, close]);

  if (!open) return null;
  return (
    <div className={styles.backdrop} onClick={close}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="lead-popup-title" onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.close} aria-label="關閉" onClick={close}>×</button>
        <div className={styles.left}>
          <div>
            <span className={styles.eyebrow}>Free Lesson</span>
            <h2 id="lead-popup-title" className={styles.title}>免費試看<br />課程影片</h2>
          </div>
          <img className={styles.mascot} src="/mascot-grand-v1.png" alt="" width="150" height="150" />
        </div>
        <div className={styles.right}>
          <p className={styles.h}>留下 Email，試看影片連結馬上寄給你</p>
          <p className={styles.desc}>新章節上架與優惠也會通知你，隨時可以取消。</p>
          <LeadForm layout="stack" cta="寄試看影片給我" onDone={onDone} align="center" />
          <button type="button" className={styles.skip} onClick={close}>先逛逛，晚點再說</button>
        </div>
      </div>
    </div>
  );
}
