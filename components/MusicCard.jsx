"use client";

import { Play } from "lucide-react";
import styles from "./MusicCard.module.css";

const WAVE = [8, 16, 7, 13, 10, 6, 14, 9];

/**
 * POINT 5 音樂 App 卡片 — 播放清單（曲目實戰）/ 錄音室（錄製成果），
 * 原生 DOM（no <img>）。由 `variant` 決定封面樣式。
 */
export default function MusicCard({ variant = "playlist", label, title, sub, tracks = [], ariaLabel }) {
  const studio = variant === "studio";

  return (
    <div className={styles.card} role="img" aria-label={ariaLabel}>
      <div className={styles.header}>
        <div className={`${styles.tile} ${studio ? styles.tileStudio : ""}`}>
          {studio ? (
            <span className={styles.rec}>
              <span className={styles.recDot} />
              REC 02:14
            </span>
          ) : (
            <>
              <span className={styles.tileBig}>20+</span>
              <span className={styles.tileSmall}>首流行曲目</span>
              <span className={styles.play}><Play size={14} strokeWidth={0} fill="currentColor" /></span>
            </>
          )}
        </div>

        <div className={styles.meta}>
          <span className={styles.label}>{label}</span>
          <span className={styles.title}>{title}</span>
          <span className={styles.sub}>{sub}</span>
        </div>
      </div>

      <ul className={styles.tracks}>
        {tracks.map((t, i) => (
          <li key={i} className={styles.track}>
            <span className={styles.lead}>
              {t.wave ? (
                <span className={styles.wave}>
                  {WAVE.map((h, j) => (
                    <span key={j} className={styles.waveBar} style={{ height: h }} />
                  ))}
                </span>
              ) : (
                <span className={styles.num}>{t.n}</span>
              )}
            </span>
            <span className={styles.trackTitle}>{t.title}</span>
            <span className={`${styles.right} ${t.status ? styles.status : styles.time}`}>
              {t.status || t.time}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
