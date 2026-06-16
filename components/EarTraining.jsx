"use client";

import { Headphones } from "lucide-react";
import styles from "./EarTraining.module.css";

// Fixed bar heights (% of card) — kept static so SSR and client markup match.
// Bright = lively/tall, dark = subdued/short, echoing major vs minor energy.
const BRIGHT = [22, 70, 84, 88, 51, 37, 60, 100, 58, 23, 88, 89, 97, 46, 54, 67, 97, 80, 29, 79];
const DARK = [13, 36, 35, 25, 25, 44, 35, 20, 44, 38, 12, 37, 45, 19, 37, 37, 25, 22, 43, 41];

/**
 * "Train your ear" visual for POINT 2, rebuilt natively (no <img>): a headphone
 * mark over two waveform cards — a bright (major) one and a dark (minor) one.
 */
export default function EarTraining({ ariaLabel }) {
  return (
    <div className={styles.viz} role="img" aria-label={ariaLabel}>
      <div className={styles.phones} aria-hidden="true">
        <span className={styles.wave} />
        <span className={`${styles.wave} ${styles.waveRight}`} />
        <Headphones size={52} strokeWidth={1.6} />
      </div>

      <div className={styles.cards}>
        <figure className={styles.card}>
          <div className={styles.bars}>
            {BRIGHT.map((h, i) => (
              <span key={i} className={styles.bar} style={{ height: `${h}%` }} />
            ))}
          </div>
          <figcaption className={`${styles.cap} ${styles.capBright}`}>
            大和弦 · 明亮
          </figcaption>
        </figure>

        <figure className={`${styles.card} ${styles.cardDark}`}>
          <div className={styles.bars}>
            {DARK.map((h, i) => (
              <span
                key={i}
                className={`${styles.bar} ${styles.barDark}`}
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
          <figcaption className={`${styles.cap} ${styles.capDark}`}>
            小和弦 · 陰暗
          </figcaption>
        </figure>
      </div>
    </div>
  );
}
