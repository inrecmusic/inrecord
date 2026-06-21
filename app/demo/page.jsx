"use client";
import { useState, useEffect } from "react";
import { TRIAL_SECONDS, formatTime, buyUrl } from "@/lib/demo";
import styles from "./demo.module.css";

// CTA：有 URL → 新分頁連結；無 → 顯示「即將開放」停用
function Cta({ url, className, children }) {
  if (!url) {
    return <span className={`${className} ${styles.ctaDisabled}`} aria-disabled="true">即將開放</span>;
  }
  return <a className={className} href={url} target="_blank" rel="noopener noreferrer">{children}</a>;
}

export default function DemoPage() {
  const [secondsLeft, setSecondsLeft] = useState(TRIAL_SECONDS);
  const ended = secondsLeft <= 0;
  const url = buyUrl();

  useEffect(() => {
    if (ended) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [ended]);

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <div className={styles.logo}>InRec<span>●</span>rd</div>
        <div className={styles.barRight}>
          <span className={`${styles.timer} ${ended ? styles.timerEnded : ""}`}>
            ▸ {formatTime(secondsLeft)}<span className={styles.cursor}>▌</span>
          </span>
          <Cta url={url} className={styles.ctaBtn}>立即預購課程</Cta>
        </div>
      </header>

      <main className={styles.stage}>
        <span className={styles.tag}>// live demo</span>
        <iframe
          className={`${styles.game} ${ended ? styles.gameLocked : ""}`}
          src="/demo-game/index.html"
          title="遊戲試玩"
          sandbox="allow-scripts"
        />
        {ended && (
          <div className={styles.overlay}>
            <div className={styles.popup}>
              <div className={styles.popupTag}>▸ trial_ended</div>
              <div className={styles.popupTitle}>試玩結束！</div>
              <p className={styles.popupBody}>預購完整版，解鎖<br />全部遊戲 + 10 章節完整課程</p>
              <Cta url={url} className={styles.popupCta}>立即預購課程 →</Cta>
              <button className={styles.replayBtn} onClick={() => window.location.reload()}>↻ 重新試玩</button>
            </div>
          </div>
        )}
      </main>

      <footer className={styles.foot}>
        試玩 2 分鐘 · 預購完整版解鎖 <b>全部遊戲 + 10 章節完整課程</b>
      </footer>
    </div>
  );
}
