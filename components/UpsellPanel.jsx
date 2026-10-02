"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { LICENSE_TERM_TEXT } from "@/lib/terms-version";
import styles from "./TrialUpsell.module.css";

// 導購視窗的「畫面」本體：試看影片看完、互動遊戲玩完都用這一個，兩邊長得一模一樣。
// 觸發時機各自負責（影片看 player.js、遊戲看結果畫面），這裡只管呈現與無障礙。
// 價格與截止時間一律由 server 端 salePhase() 算好用 offer 傳進來，本檔一個數字都不寫死。
// 法務句取 lib/terms-version 的 LICENSE_TERM_TEXT（全站唯一權威寫法）。

// 倒數格式化（純函式、無 Date.now）：ms → "N 天 HH:MM:SS"
export function fmtCountdown(ms) {
  let left = Math.max(0, ms);
  const days = Math.floor(left / 86400000); left -= days * 86400000;
  const h = Math.floor(left / 3600000); left -= h * 3600000;
  const m = Math.floor(left / 60000); left -= m * 60000;
  const s = Math.floor(left / 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${days} 天 ${p(h)}:${p(m)}:${p(s)}`;
}

// 千分位（不走 toLocaleString，避免不同 ICU 的空白／格式差異）
export function nt(n) {
  return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// 開著才掛載（關閉＝呼叫端不再渲染它），鎖捲動／焦點／倒數都跟著元件的生命週期走。
// 呼叫端不要再自己鎖一次：兩邊各存一份 overflow，關閉時會把 hidden 還回去，頁面就捲不動了。
export default function UpsellPanel({
  title, sub, offer, onClose,
  ctaHref = "/?ref=trial-endcard#pricing",
  closeLabel = "先關掉，回到影片",
  labelId = "upsell-title",
}) {
  const [nowMs, setNowMs] = useState(null); // 倒數：mounted 後才有值 → 首次渲染不碰 Date.now()
  const panelRef = useRef(null);
  const returnFocusRef = useRef(null);
  const downOnBackdropRef = useRef(false);

  const close = useCallback(() => {
    const el = returnFocusRef.current;
    returnFocusRef.current = null;
    onClose?.();
    if (el && typeof el.focus === "function") el.focus();
  }, [onClose]);

  // 鎖捲動、Esc 可關、焦點移進視窗並關在裡面；關閉後把焦點還給觸發元素
  useEffect(() => {
    returnFocusRef.current = document.activeElement;
    panelRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { close(); return; }
      if (e.key !== "Tab") return;
      const f = panelRef.current?.querySelectorAll("a[href], button:not([disabled])");
      if (!f?.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panelRef.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [close]);

  // 倒數 ticker：每秒更新
  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const leftMs = nowMs != null && offer?.deadlineMs ? offer.deadlineMs - nowMs : null;
  // 進頁當下算的價，看到彈窗時可能已經過期（截止前幾分鐘進站的人）→ 整組降級成不報價
  const expired = leftMs != null && leftMs <= 0;
  const mode = expired ? "none" : offer?.mode || "none";
  const showCountdown = mode !== "none" && leftMs != null && leftMs > 0;
  const badge = mode === "fan" ? "粉絲限定 · 限時"
    : mode === "wave" ? "限時優惠 · 即將調漲"
    : mode === "list" ? offer?.planName || "" : "";

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(e) => { downOnBackdropRef.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && downOnBackdropRef.current) close(); }}
    >
      <div ref={panelRef} tabIndex={-1} className={styles.modal} role="dialog" aria-modal="true" aria-labelledby={labelId}>
        <button type="button" className={styles.close} aria-label="關閉" onClick={close}>×</button>
        <div className={styles.scroll}>
          {badge ? <span className={styles.badge}>{badge}</span> : null}
          <h2 id={labelId} className={styles.title}>{title}</h2>
          <p className={styles.body}>{sub}</p>
          <ul className={styles.facts}>
            <li>10 章節 ＋ 2 附錄，約 6 小時</li>
            <li>24 個三和弦（12 個大三和弦 ＋ 12 個小三和弦）</li>
            <li>10 首曲目實戰</li>
          </ul>
          {mode !== "none" && (
            <>
              <div className={styles.priceRow}>
                <span className={styles.price}>NT${nt(offer.price)}</span>
                {offer.originalPrice > offer.price ? <span className={styles.was}>NT${nt(offer.originalPrice)}</span> : null}
              </div>
              {showCountdown && (
                <p className={styles.countdown}>
                  {mode === "fan"
                    ? <>距離 {offer.deadlineLabel} 截止還有 <strong>{fmtCountdown(leftMs)}</strong>，截止後調漲</>
                    : <>
                        <span className={styles.deadline}>
                          <span>{offer.deadlineLabel} 前 NT${nt(offer.price)}</span>
                          {offer.nextPrice ? <>，<span className={styles.after}>之後 NT${nt(offer.nextPrice)}</span></> : null}
                        </span>
                        距離調漲還有 <strong>{fmtCountdown(leftMs)}</strong>
                      </>}
                </p>
              )}
            </>
          )}
        </div>
        {/* 頁尾不參與內捲：橫向手機／矮視窗也保證主 CTA 看得到 */}
        <div className={styles.foot}>
          <a className={styles.cta} href={ctaHref}>查看課程方案</a>
          {/* 條款原文不動（其他頁面共用）；只在顯示時把「至少 3 年」用不斷行空格綁住，避免折行 */}
          <p className={styles.fine}>一次買斷，{LICENSE_TERM_TEXT.replace("至少 3 年", "至少 3 年")}。</p>
          <button type="button" className={styles.later} onClick={close}>{closeLabel}</button>
        </div>
      </div>
    </div>
  );
}
