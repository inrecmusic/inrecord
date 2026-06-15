"use client";

import { RotateCcw, Music } from "lucide-react";
import styles from "./ChordProgression.module.css";

const CANON = ["C", "G", "Am", "Em", "F", "C", "F", "G"];

/**
 * POINT 3 卡農萬用進行 — 八顆和弦骨架 + 可循環提示，原生 DOM（no <img>）。
 */
export default function ChordProgression({ ariaLabel }) {
  return (
    <div className={styles.viz} role="img" aria-label={ariaLabel}>
      <div className={styles.top}>
        <Music size={14} strokeWidth={2} />
        <span>適用無數流行歌</span>
      </div>

      <div className={styles.chips}>
        {CANON.map((c, i) => (
          <span key={i} className={styles.chip}>{c}</span>
        ))}
      </div>

      <div className={styles.loop}>
        <RotateCcw size={15} strokeWidth={2.2} />
        <span>可不斷循環反覆</span>
      </div>
    </div>
  );
}
